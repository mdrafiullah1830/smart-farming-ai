import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { currentUser } from '../auth.ts';

type OpenMeteo = {
  current: { temperature_2m: number; relative_humidity_2m: number; precipitation: number; weather_code: number; wind_speed_10m: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; weather_code: number[] };
};

function weatherInfo(code: number, lang: string): { condition: string; icon: string } {
  const bn = lang !== 'en';
  if (code === 0) return { condition: bn ? 'পরিষ্কার আকাশ' : 'Clear sky', icon: '☀️' };
  if (code <= 3) return { condition: bn ? 'আংশিক মেঘলা' : 'Partly cloudy', icon: '⛅' };
  if (code <= 48) return { condition: bn ? 'কুয়াশা' : 'Foggy', icon: '🌫️' };
  if (code <= 67) return { condition: bn ? 'বৃষ্টি' : 'Rain', icon: '🌧️' };
  if (code <= 77) return { condition: bn ? 'শিলাবৃষ্টি' : 'Hail', icon: '🌨️' };
  if (code <= 82) return { condition: bn ? 'বৃষ্টির ঝড়' : 'Rain showers', icon: '🌦️' };
  return { condition: bn ? 'বজ্রঝড়' : 'Thunderstorm', icon: '⛈️' };
}

export async function weatherRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let lat = Number(url.searchParams.get('lat') ?? 23.81);
  let lon = Number(url.searchParams.get('lon') ?? url.searchParams.get('lng') ?? 90.41);
  const zilla = url.searchParams.get('zilla');
  if (zilla && !url.searchParams.has('lat')) {
    const district = await env.DB.prepare('SELECT latitude, longitude FROM districts WHERE name_en = ? COLLATE NOCASE').bind(zilla).first<{ latitude: number; longitude: number }>();
    if (district) { lat = district.latitude; lon = district.longitude; }
  }
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'bn';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return error(request, env, 400, 'Valid coordinates are required');
  const upstream = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=Asia%2FDhaka&forecast_days=7`);
  if (!upstream.ok) return error(request, env, 503, 'Weather service unavailable');
  const data = await upstream.json<OpenMeteo>();
  const info = weatherInfo(data.current.weather_code, lang);
  const hourly = data.hourly.time.slice(0, 24).map((time, index) => ({
    time: time.slice(11, 16), temp: Math.round(data.hourly.temperature_2m[index]),
    icon: weatherInfo(data.hourly.weather_code[index], lang).icon,
    precipitation_probability: data.hourly.precipitation_probability[index] ?? 0,
  }));
  const forecast = data.daily.time.map((date, index) => {
    const dailyInfo = weatherInfo(data.daily.weather_code[index], lang);
    return {
      date, dayShort: new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'short' }).format(new Date(`${date}T12:00:00Z`)),
      icon: dailyInfo.icon, condition: dailyInfo.condition,
      temp: `${Math.round(data.daily.temperature_2m_min[index])}° / ${Math.round(data.daily.temperature_2m_max[index])}°`,
      precipitationProbability: Math.round(Math.min(100, (data.daily.precipitation_sum[index] ?? 0) * 15)),
    };
  });
  return json(request, env, {
    success: true, coords: { lat, lng: lon },
    current: { temp: Math.round(data.current.temperature_2m), feelsLike: Math.round(data.current.temperature_2m), humidity: Math.round(data.current.relative_humidity_2m), wind: Math.round(data.current.wind_speed_10m), windDir: '', uvIndex: null, weatherCode: data.current.weather_code, condition: info.condition, icon: info.icon },
    hourly, forecast,
  });
}

export async function weatherLocationRoute(request: Request, env: Env): Promise<Response> {
  return weatherRoute(request, env);
}