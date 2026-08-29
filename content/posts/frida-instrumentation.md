+++
date = '2026-08-28T01:17:44-03:00'
draft = false
title = 'Frida Instrumentation: A Mutated Data Object Reaches Persistence and Storage Without Validation'
+++

# When modified data is trusted and accepted by the app's persistence pipeline without integrity checks.


Frida is a dynamic runtime instrumentation toolkit, aimed at reverse engineers, security researchers and developers for testing and debugging apps. It works in different environments as Windows, Linux, Mac but it's most recognized in the area of mobile pentesting as a tool for analysing an Android or IOS app.

This Open Source flexible tool injects a script in a runtime process, and for this its main programming language is javascript, hooks the app's methods and traces function calls, among other features. There is no need for recompile the app then, its dynamic execution in JVM.

It is a very good tool for observing an application surgically and inferring its behavior. When combined with static analysis beforehand, it can be used to validate a hypothesis, such as confirming control flow and data flow segments in real time. In other words, if static analysis helps us orient ourselves through the app, Frida allows us to verify part of that assumption in reality.

For that reason, Frida is not just an ephemeral patcher for apps, but rather a magnifying glass that gives us a closer look at an application. This toolkit sheds more light on an app's behavior and allows us to understand a bit more about the inner logic.

I’m taking this exercise as a reference from Roman Stuehler’s excellent tutorial, Android App Hacking - Black Belt Edition, where he uses a dice game app from Secuso Privacy Apps. I’ll be switching to another Secuso app called Shopping List to put an example with a different functionality and characteristics. Mobile apps usually have multiple controls we would need to get around, along with more controlled logic, but it works as a simple example to understand the concept.

The goal of this exercise was to statically identify a class in the Shopping List app called ProductItem, which contains a field named `quantity`, and then change that value, not to demonstrate that a value can be changed in memory, but rather to confirm whether another object consuming that value, once modified, performs any integrity check on it or deliberately trusts it as valid and unaltered data.

![Waydroid GUI](/tainted_mutation_flow_v2.png)

The idea was also to see whether that modified value would be saved by another object and persisted and use this tool in a way where, starting from a hypothesis, every answer always leads us to another question.

We are not trying to understand the app's entire logic, but rather to start from a particular entry point. Static analysis with jd-gui, jadx, or Androguard (the latter being very good for visualizing caller paths) gives us a model, but only through dynamic instrumentation we are able to confirm it or discover other aspects.

In this case, the entry point is the ProductItem class, which contains `quantity`. When looking at the decompiled code of an APK, we are not trying to perform a code review. The focus is on the structure that we can traverse with these static analysis tools, in order to identify points of interest and the packages and their respective classes that we can later add to our Frida scripts.

The first step is start Waydroid or another emulator , with frida server running on it and the terminal with another tab open in our host to initialize the correct package:

```bash
frida -U -N privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist
```

Once in Frida's Repl, we run our frida scripts in two steps: 

## Script 1, testing the converter boundary:


```frida snippet
Java.perform(function () {

    const Converter = Java.use(
        "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.business.impl.converter.impl.ProductConverterServiceImpl"
    );


    console.log("\n========================================");
    console.log(" ProductItem → ProductItemEntity tracer");
    console.log("========================================");


    /*
     * Find the exact runtime overload of
     * convertItemToEntity().
     */

    let convertMethod = null;

    Converter.convertItemToEntity.overloads.forEach(function (overload) {

        const args = overload.argumentTypes;

        console.log(
            "[OVERLOAD]",
            args.map(function (arg) {
                return arg.className;
            }).join(", ")
        );

        if (
            args.length === 2 &&
            args[0].className ===
                "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.business.domain.ProductItem" &&
            args[1].className ===
                "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.persistence.entity.ProductItemEntity"
        ) {

            convertMethod = overload;
        }
    });


    if (convertMethod === null) {

        console.log(
            "[-] Expected ProductItem → ProductItemEntity overload was not found"
        );

        return;
    }


    console.log(
        "[+] Found correct convertItemToEntity() overload"
    );


    /*
     * Hook the converter.
     */

    convertMethod.implementation = function (item, entity) {

        console.log("\n========== CONVERTER ==========");


        /*
         * Observe ProductItem entering
         * the converter.
         */

        try {

            console.log(
                "ProductItem ID       :",
                item.getId().toString()
            );

            console.log(
                "ProductItem name     :",
                item.getProductName()
            );

            console.log(
                "ProductItem quantity  :",
                item.getQuantity()
            );

        } catch (e) {

            console.log(
                "[-] ProductItem read error:",
                e
            );
        }


        /*
         * Execute the ORIGINAL converter.
         */

        const result = convertMethod.call(
            this,
            item,
            entity
        );


        /*
         * Observe the resulting Entity.
         */

        try {

            console.log(
                "Entity ID            :",
                entity.getId().toString()
            );

            console.log(
                "Entity name          :",
                entity.getProductName()
            );

            console.log(
                "Entity quantity      :",
                entity.getQuantity()
            );

        } catch (e) {

            console.log(
                "[-] Entity read error:",
                e
            );
        }


        console.log(
            "================================\n"
        );


        return result;
    };


    console.log("[*] Converter hook installed");
    console.log("[*] Waiting for conversion...\n");

});
```

![Waydroid GUI](/converter-20-2.png)


We establish the transition ProductItem to Entity without changes. Now,the converter is currently behaving as a data transfer boundary for quantity: the value entering it '20',is the value appearing in the entity. After the execution we click save.


![Waydroid GUI](/object-20-2.png)


## Script 2, testing persistence:

```frida snippet
Java.perform(function () {

    /*
     * ====================================================
     * Classes
     * ====================================================
     */

    const Converter = Java.use(
        "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.business.impl.converter.impl.ProductConverterServiceImpl"
    );

    const ProductItem = Java.use(
        "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.business.domain.ProductItem"
    );

    const ProductItemEntity = Java.use(
        "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.persistence.entity.ProductItemEntity"
    );

    const AbstractDao = Java.use(
        "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.framework.persistence.AbstractDao"
    );


    /*
     * ====================================================
     * 1. Hook ProductConverterServiceImpl
     * ====================================================
     */

    let convertMethod = null;

    Converter.convertItemToEntity.overloads.forEach(function (overload) {

        const args = overload.argumentTypes;

        if (
            args.length === 2 &&
            args[0].className ===
                "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.business.domain.ProductItem" &&
            args[1].className ===
                "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.persistence.entity.ProductItemEntity"
        ) {

            convertMethod = overload;
        }
    });


    if (convertMethod === null) {

        console.log(
            "[-] convertItemToEntity(ProductItem, ProductItemEntity) not found"
        );

        return;
    }


    convertMethod.implementation = function (item, entity) {

        console.log("\n========== CONVERTER ==========");

        try {

            console.log(
                "ProductItem ID       :",
                item.getId().toString()
            );

            console.log(
                "ProductItem name     :",
                item.getProductName()
            );

            console.log(
                "Original quantity    :",
                item.getQuantity()
            );


            /*
             * Controlled mutation.
             */

            item.setQuantity("9999");

            console.log(
                "MUTATED quantity     :",
                item.getQuantity()
            );

        } catch (e) {

            console.log(
                "[-] ProductItem error:",
                e
            );
        }


        /*
         * Execute the ORIGINAL converter.
         */

        const result = convertMethod.call(
            this,
            item,
            entity
        );


        /*
         * Observe the resulting entity.
         */

        try {

            console.log(
                "Entity ID            :",
                entity.getId().toString()
            );

            console.log(
                "Entity name          :",
                entity.getProductName()
            );

            console.log(
                "Entity quantity      :",
                entity.getQuantity()
            );

        } catch (e) {

            console.log(
                "[-] Entity error:",
                e
            );
        }

        console.log("================================\n");

        return result;
    };


    /*
     * ====================================================
     * 2. Hook AbstractDao.saveOrUpdate(AbstractEntity)
     * ====================================================
     */

    let saveMethod = null;

    AbstractDao.saveOrUpdate.overloads.forEach(function (overload) {

        const args = overload.argumentTypes;

        if (
            args.length === 1 &&
            args[0].className ===
                "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.framework.persistence.AbstractEntity"
        ) {

            saveMethod = overload;
        }
    });


    if (saveMethod === null) {

        console.log(
            "[-] saveOrUpdate(AbstractEntity) not found"
        );

        return;
    }


    saveMethod.implementation = function (entity) {

        console.log("\n========== DATA ACCESS OBJECT ==========");

        try {

            console.log(
                "Entity class         :",
                entity.getClass().getName()
            );

            console.log(
                "Entity ID            :",
                entity.getId().toString()
            );


            /*
             * Only inspect ProductItemEntity objects.
             */

            if (
                entity.getClass().getName() ===
                "privacyfriendlyshoppinglist.secuso.org.privacyfriendlyshoppinglist.logic.product.persistence.entity.ProductItemEntity"
            ) {

                console.log(
                    "Entity product name  :",
                    entity.getProductName()
                );

                console.log(
                    "Entity quantity      :",
                    entity.getQuantity()
                );
            }

        } catch (e) {

            console.log(
                "[-] DAO entity error:",
                e
            );
        }


        /*
         * Execute the ORIGINAL saveOrUpdate().
         */

        const result = saveMethod.call(
            this,
            entity
        );


        console.log(
            "saveOrUpdate result  :",
            result
        );

        console.log("==================================\n");

        return result;
    };


    console.log("[*] Converter hook installed");
    console.log("[*] AbstractDao.saveOrUpdate() hook installed");
    console.log("[*] Waiting for Save operation...\n");

});
```

Second script task is to test whether a controlled mutation survives the application's next boundaries. In this step we modify 'quantity' value to 9999.

```
ProductItem   ->  Frida mutation   ->  ProductConverter  ->  ProductItemEntity -> AbstractDao.saveOrUpdate()
quantity = 90	  quantity = 9999      quantity = 9999			          returned 1			     
 	    				
 -> app restarted
    GUI Shows 9999
```

![Waydroid GUI](/persistence-9999-2.png)

After triggering the save button again and restart the app, if the value is still 9999, we demonstrated persistence for this state.

![Waydroid GUI](/restart-gui-9999-2.png)

Frida was used to mutate application state at the ProductItem layer and trace the resulting data through a converter and a persistence layer. The mutated value reached SQLite and survived application restart, with no integrity check observed at the instrumented boundaries.Though, SQLite was not instrumented in this excersise. In any of this transitions the application validated or rejected the transformed data.






