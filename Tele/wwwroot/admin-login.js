"use strict";
const form = document.getElementById("loginForm");
form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = document.getElementById("loginButton"), message = document.getElementById("loginMessage");
  message.textContent = ""; message.classList.remove("error"); button.disabled = true;
  try {
    const response = await fetch("/api/auth/login", {
      method:"POST", cache:"no-store", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({senha:document.getElementById("adminPassword").value})
    });
    if (!response.ok) throw new Error(response.status === 429 ? "Muitas tentativas. Aguarde um minuto e tente novamente." : "Senha incorreta.");
    const candidate = new URLSearchParams(location.search).get("returnUrl") || "/admin.html";
    const destination = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/admin.html";
    location.replace(destination);
  } catch (error) { message.textContent = error.message; message.classList.add("error"); }
  finally { button.disabled = false; }
});
