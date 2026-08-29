+++
date = '2026-06-01T17:17:44-03:00'
draft = false
title = 'Waydroid: Running Android on Low-Spec Linux Hardware'
+++

Some time ago, while looking for Android emulator options for a pretty old machine (a 10+ year old i3 with only 4 GB of RAM), I came across <a href="https://waydro.id/" target="_blank" rel="noopener">Waydroid</a>, an Open Source project from <a href="https://blisslabs.org/" target="_blank" rel="noopener">BlissLabs</a>.

Waydroid runs on GNU/Linux systems using the Wayland protocol and supports ARM, ARM64, x86, and x86_64 architectures. It ships with an Android image based on LineageOS and can be installed either with or without Google Play Services.

The official documentation is available <a href="https://docs.waydro.id/" target="_blank" rel="noopener">here</a>, so I won't repeat the installation steps. Instead, I'll briefly cover the setup I use on Debian 12, which is the distribution running on my machine. Waydroid is also available for other distributions through the official documentation.

![Waydroid GUI](/waydroid-gui.png)

## Choosing Waydroid

Traditional Android emulators can be quite resource hungry. Very roughly speaking, they may need to translate instructions between architectures (for example x86_64 and ARM) so applications can run correctly.

Since my hardware is limited, I run Waydroid directly on the host instead of inside another virtual machine. Even so, it's still a good idea to use an isolated environment before installing and testing random applications.

Running Android inside a container is much lighter and more flexible than using Android Studio on older hardware. Waydroid uses the host's hardware resources directly and runs Android inside an LXC-style container.

The image itself is not rooted, but it is customized for debugging purposes. Because of that, it's common to use ADB commands or Linux privileges (for example `sudo cp`) when making changes, especially if we don't have superuser access inside the Waydroid shell itself.

## Proxying Android Traffic

In my experience, Waydroid is more configurable than other Android emulators, although that comes with the requirement of using the terminal for tweaking stuff.

For application testing I usually install a proxy such as Mitmproxy or Burp. <a href="https://www.mitmproxy.org/" target="_blank" rel="noopener">Mitmproxy</a>is particularly lightweight, runs entirely in the terminal, and supports protocols beyond plain HTTP, making it a good choice for inspecting mobile traffic.

I also use ADB (Android Debug Bridge), which provides the communication layer between the Linux host and the Android device.

I won't cover certificate generation since every proxy provides its own documentation. Instead, I'll focus on installing a system CA certificate inside Waydroid using ADB.

## Install ADB

```bash
sudo apt install android-tools
```

## Start Waydroid

```bash
waydroid session start
```

## Get the Container IP Address

```bash
waydroid status
```

## Connect ADB to Waydroid

```bash
adb connect <IP_ADDRESS>:5555
```

## Create the Certificate Directory

```bash
sudo mkdir -p /var/lib/waydroid/overlay/system/etc/security/cacerts/
```

This step is important because the path does not exist inside the overlay directory by default and must be created manually.

If you run into issues, check the Waydroid GitHub repository and issue tracker.

## Install the Certificate

Generate the certificate hash:

```bash
openssl x509 -subject_hash_old -in my-ca-cert.pem | head -1
```

Example output:

```text
13acab12
```

Copy and rename the certificate:

```bash
sudo cp my-ca-cert.pem /var/lib/waydroid/overlay/system/etc/security/cacerts/13acab12.0
sudo chmod 644 /var/lib/waydroid/overlay/system/etc/security/cacerts/13acab12.0
```

I use `sudo cp` here to avoid permission issues when modifying the overlay filesystem.

## Restart Waydroid

```bash
waydroid session stop
```

Start it again before configuring the proxy.

## Configure the Proxy

After restarting Waydroid:

```bash
adb shell settings put global http_proxy "<WAYDROID_IP>:5555"
adb shell settings put global https_proxy "<WAYDROID_IP>:5555"
```

### Important Tip

Avoid mixing commands such as:

```bash
settings put global http_proxy
```

with:

```bash
settings put global global_http_proxy_port
```

Waydroid may persist proxy values in different places, and if those values become inconsistent, you can end up with a container that has no internet connectivity on the next boot.

To verify the current proxy values:

```bash
adb shell settings get global http_proxy
adb shell settings get global https_proxy
```

## Disable the Proxy Before Closing Waydroid

Before shutting down Waydroid, I recommend resetting the proxy values:

```bash
adb shell settings put global http_proxy "<WAYDROID_IP>:0"
adb shell settings put global https_proxy "<WAYDROID_IP>:0"
```

Then verify the values from inside the container:

```bash
waydroid shell settings list global | grep proxy
```

All proxy-related entries should be consistent.

and last step:

```bash
waydroid session stop
```

In my experience it's better not to configure Waydroid to always start behind a proxy. Start the container, enable the proxy when needed, and reset it before shutting down.

Otherwise, stale proxy values can be cached and you'll eventually open Waydroid only to discover it has no internet access or partially internet connectivity, leading to unnecessary troubleshooting and time wasted.

Once you're comfortable with the process, a simple shell script can automate the entire workflow.

## Multi-Window Mode

To make Android applications appear as separate Linux windows:

```bash
waydroid prop set persist.waydroid.multi_windows true
```

## Why I Liked This Setup

Most documentation for proxies such as Burp Suite or tutorials around assumes Android Studio is being used as the emulator.

Waydroid has its own quirks. Troubleshooting often means looking through several layers at once: Linux, Android, networking, containerization, caching, etc.

On the other hand, that's also one of the reasons I found it interesting.

Besides consuming fewer resources, the setup process itself exposes more of what's happening underneath. You get a better understanding of how Android internal's networking works and how services interact.

A lot of that complexity is hidden under the hood when using Android Studio.

Sometimes debugging the fragile parts of a setup teaches more than a setup that works perfectly and it's clean from the start.

## Additional Performance Tweaks for old computers.

Disable animations:

```bash
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

Limit background processes:

```bash
adb shell settings put global background_process_limit 1
```

Inspect running processes:

```bash
sudo waydroid shell

ps -A
```

Kill unnecessary processes:

```bash
kill -9 <PID>
```

## Adjust Memory Limits

Check the current configuration:

```bash
cat /var/lib/waydroid/waydroid.cfg
```

To increase memory limits and reduce crashes:

```bash
sudo nano /var/lib/waydroid/lxc/waydroid/config
```

Search for:

```text
lxc.cgroup2.memory.max
```

Depending on your requirements, you can increase the value or remove the limit entirely.
So, set up your own lab and have fun!.
