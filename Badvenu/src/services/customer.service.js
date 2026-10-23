
import { apiFetch } from "../lib/api";

export async function requestCustomerOtp({ name, email }) {
  return apiFetch("/api/customer-auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
}

export async function verifyCustomerOtp({ email, code }) {
  return apiFetch("/api/customer-auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function getCustomerProfile() {
  return apiFetch("/api/customer-auth/me");
}

export async function getCustomerBookings() {
  return apiFetch("/api/customer-auth/bookings");
}
export async function logoutCustomer() {
  return apiFetch("/api/customer-auth/logout", {
    method: "POST",
  });
}
