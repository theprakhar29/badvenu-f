import { apiFetch } from "../lib/api";

export async function submitContactMessage({ name, email, subject, message }) {
  return apiFetch("/api/contact", {
    method: "POST",
    body: JSON.stringify({ name, email, subject, message }),
  });
}