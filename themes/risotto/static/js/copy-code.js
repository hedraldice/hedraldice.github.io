document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("pre").forEach((pre) => {
    const button = document.createElement("button");

    button.className = "copy-code-button";
    button.innerHTML = '<i class="fa-regular fa-clipboard"></i>';

    button.addEventListener("click", async () => {
      const code = pre.querySelector("code")?.innerText || "";

      try {
        await navigator.clipboard.writeText(code);

        button.innerHTML = '<i class="fa-solid fa-check"></i>';

        setTimeout(() => {
          button.innerHTML = '<i class="fa-regular fa-clipboard"></i>';
        }, 1500);
      } catch (err) {
        console.error(err);
      }
    });

    pre.appendChild(button);
  });
});
