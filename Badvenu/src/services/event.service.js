import { apiFetch } from "../lib/api";

// ---------- PUBLIC ----------

export async function getPublishedEvents({ city, q, category } = {}) {
  const params = new URLSearchParams();

  if (city) params.set("city", city);
  if (q) params.set("q", q);
  if (category) params.set("category", category);

  const query = params.toString();

  return apiFetch(`/api/public/events${query ? `?${query}` : ""}`);
}


export async function getPublishedEventBySlug(slug) {
  return apiFetch(`/api/public/events/${slug}`);
}

// ---------- ORGANIZER ----------

export async function getMyEvents() {
  return apiFetch("/api/events/mine");
}

export async function getMyEvent(id) {
  return apiFetch(`/api/events/${id}`);
}

export async function getEventStats(id) {
  return apiFetch(`/api/events/${id}/stats`);
}

export async function createEvent(eventData) {
  return apiFetch("/api/events", {
    method: "POST",
    body: JSON.stringify(eventData),
  });
}

export async function updateEventStatus(id, status) {
  return apiFetch(`/api/events/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateFormFields(id, formFields) {
  return apiFetch(`/api/events/${id}/form-fields`, {
    method: "PUT",
    body: JSON.stringify({
      formFields,
    }),
  });
}

export async function uploadEventBanner(id, file) {
  const formData = new FormData();

  formData.append("banner", file);

  return apiFetch(`/api/events/${id}/banner`, {
    method: "POST",
    body: formData,
  });
}

