import { apiFetch } from "../lib/api";

export async function signup({ name, email, password }) {

   console.log("📡 signup() called");
  return apiFetch("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      password,
    }),
  });
}

export async function login({ email, password }) {

  console.log("📡 login() called");
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });
}

export async function logout() {
  return apiFetch("/api/auth/logout", {
    method: "POST",
  });
}

export async function getCurrentUser() {
  return apiFetch("/api/auth/me");
}