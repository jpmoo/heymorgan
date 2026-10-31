// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// The weather, from Open-Meteo: free, no account and no key. Asked with a
// place's name (looked up by Open-Meteo's own geocoder) or with coordinates,
// rounded to about a kilometre before they leave. What comes back is written
// as the model reads best and says most easily: now, the next hours, and a
// week of days, each with its date.

const SKY = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "heavy freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "heavy freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "light showers", 81: "showers", 82: "heavy showers", 85: "snow showers", 86: "heavy snow showers",
  95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with heavy hail",
};
const sky = (code) => SKY[code] ?? "unsettled";
const round = (value) => Math.round(Number(value) * 100) / 100;

// Fahrenheit where the user's clock is in the United States; Celsius elsewhere. Or as set.
export function unitsFor(setting, zone) {
  if (setting === "f" || setting === "c") return setting;
  return /^America\/(?!Toronto|Vancouver|Montreal|Halifax|Winnipeg|Edmonton|Regina|St_Johns|Mexico|Sao_Paulo|Argentina|Bogota|Lima|Santiago|Caracas)/.test(zone ?? "") || /^Pacific\/Honolulu$/.test(zone ?? "") ? "f" : "c";
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`the weather service answered ${response.status}`);
  return response.json();
}

// A place by name: its coordinates and the name to say, or null.
export async function geocode(name) {
  const [town, ...rest] = String(name).split(",").map((part) => part.trim()).filter(Boolean);
  if (!town) return null;
  const found = await get(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: town, count: "10", language: "en" })}`);
  const places = found.results ?? [];
  // "Portland, Maine": the one whose state or country is named, else the most populous.
  const hint = rest.join(" ").toLowerCase();
  const named = hint ? places.find((p) => [p.admin1, p.country, p.country_code].some((part) => part && (hint.includes(part.toLowerCase()) || part.toLowerCase().includes(hint)))) : null;
  const place = named ?? places[0];
  if (!place) return null;
  return { lat: place.latitude, lon: place.longitude, name: [place.name, place.admin1, place.country_code === "US" ? "" : place.country].filter(Boolean).join(", ") };
}

// "40.7, -74.0", as a home setting may be given: coordinates, or null.
export function coordinates(text) {
  const found = String(text ?? "").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return found ? { lat: Number(found[1]), lon: Number(found[2]) } : null;
}

// The weather at a place, as text for the model.
export async function forecast({ lat, lon, name }, units = "f") {
  const f = units === "f";
  const query = new URLSearchParams({
    latitude: String(round(lat)), longitude: String(round(lon)), timezone: "auto", forecast_days: "7",
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset",
    temperature_unit: f ? "fahrenheit" : "celsius", wind_speed_unit: f ? "mph" : "kmh", precipitation_unit: f ? "inch" : "mm",
  });
  const got = await get(`https://api.open-meteo.com/v1/forecast?${query}`);
  const deg = f ? "°F" : "°C";
  const wind = f ? "mph" : "km/h";
  const rain = f ? "in" : "mm";
  const t = (value) => `${Math.round(value)}${deg}`;
  const now = got.current;
  const lines = [`The weather ${name ? `in ${name}` : "where the user is"} (times are local there, ${got.timezone}).`,
    `Now: ${sky(now.weather_code)}, ${t(now.temperature_2m)}, feeling like ${t(now.apparent_temperature)}, wind ${Math.round(now.wind_speed_10m)} ${wind}.`];

  // The next twelve hours, every three, for "this afternoon" and "tonight".
  const hours = got.hourly;
  const start = hours.time.findIndex((time) => time >= now.time.slice(0, 13));
  const coming = [];
  for (let i = Math.max(0, start) + 1; i < hours.time.length && coming.length < 4; i += 3) {
    const at = new Date(`${hours.time[i]}:00`).toLocaleTimeString("en-US", { hour: "numeric" });
    coming.push(`${at} ${sky(hours.weather_code[i])}, ${t(hours.temperature_2m[i])}, ${hours.precipitation_probability[i] ?? 0}% chance of rain or snow`);
  }
  if (coming.length) lines.push(`Coming hours: ${coming.join("; ")}.`);

  const days = got.daily;
  for (let i = 0; i < days.time.length; i++) {
    const day = new Date(`${days.time[i]}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const wet = days.precipitation_sum[i] > 0 ? `, ${days.precipitation_sum[i]} ${rain} expected` : "";
    lines.push(`${i === 0 ? "Today" : i === 1 ? "Tomorrow" : day}${i < 2 ? ` (${day})` : ""} [${days.time[i]}]: ${sky(days.weather_code[i])}, high ${t(days.temperature_2m_max[i])}, low ${t(days.temperature_2m_min[i])}, `
      + `${days.precipitation_probability_max[i] ?? 0}% chance of rain or snow${wet}, wind up to ${Math.round(days.wind_speed_10m_max[i])} ${wind}`
      + `${i === 0 ? `; sunrise ${days.sunrise[i].slice(11)}, sunset ${days.sunset[i].slice(11)}` : ""}.`);
  }
  return lines.join("\n");
}
