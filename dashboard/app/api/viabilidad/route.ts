import { NextRequest, NextResponse } from "next/server";

const ML_API_URL = process.env.ML_VIABILIDAD_API_URL ?? "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    const res = await fetch(`${ML_API_URL}/predict/viabilidad`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Error al consultar el modelo de viabilidad", detalle: data },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Error llamando a la API de viabilidad:", err);
    return NextResponse.json(
      { error: "No se pudo conectar con la API de ML. ¿Está corriendo en el puerto 8001?" },
      { status: 503 }
    );
  }
}