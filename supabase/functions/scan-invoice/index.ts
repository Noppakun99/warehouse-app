// Supabase Edge Function: scan-invoice
// รับรูปภาพบิลยา → ส่งให้ Google Gemini Vision → return structured JSON
// Deploy: supabase functions deploy scan-invoice
// Secret: supabase secrets set GEMINI_API_KEY=AIza...

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EXTRACT_PROMPT = `คุณคือผู้ช่วยอ่านใบกำกับภาษี/ใบส่งของยาสำหรับคลังยาโรงพยาบาล

จากภาพบิลที่ส่งมา ให้สกัดข้อมูลและตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น

โครงสร้าง JSON ที่ต้องการ:
{
  "supplier": "ชื่อบริษัทผู้ขาย (เต็ม)",
  "invoice_number": "เลขที่บิล/ใบกำกับ",
  "invoice_date": "YYYY-MM-DD หรือ null ถ้าไม่ชัดเจน",
  "vat_percent": 0 หรือ 7 (ตัวเลข ไม่มี %),
  "subtotal": ราคาก่อน VAT (ตัวเลข),
  "vat_amount": ภาษีมูลค่าเพิ่ม (ตัวเลข),
  "invoice_total": ยอดรวมทั้งบิล (ตัวเลข),
  "items": [
    {
      "drug_name": "ชื่อยา (เต็ม รวม strength และ form)",
      "gpu_code": "รหัส GPU หรือ null",
      "tpu_code": "รหัส TPU หรือ null",
      "ttmp_code": "รหัส TTMP หรือ null",
      "lot_number": "Lot No หรือ B.No. หรือ null",
      "qty_received": จำนวน (ตัวเลข),
      "drug_unit": "หน่วย เช่น หลอด กล่อง เม็ด",
      "price_per_unit": ราคาต่อหน่วย (ตัวเลข),
      "total_price_vat": จำนวนเงินต่อรายการ (ตัวเลข),
      "mfg_date": "YYYY-MM-DD หรือ null",
      "expiry_date": "YYYY-MM-DD หรือ null"
    }
  ]
}

กฎสำคัญ:
- ถ้าบิลมีหลายรายการ ให้ใส่ items[] ทุกรายการ
- GPU = รหัสกรมบัญชีกลาง, TPU = รหัส TPU ใน label ยา, TTMP = รหัสยาแผนไทย
- วันที่ให้แปลงเป็น YYYY-MM-DD เสมอ (ปี ค.ศ.)
- ถ้า expire date ระบุแค่เดือน/ปี เช่น "Feb-2028" ให้ใช้วันสุดท้ายของเดือน: "2028-02-28"
- ถ้า mfg date ระบุแค่เดือน/ปี ให้ใช้วันที่ 1 ของเดือน: "2025-09-01"
- ตอบกลับ JSON เท่านั้น ห้ามมีข้อความอื่นนำหน้าหรือตามท้าย`;

const GEMINI_MODEL = 'gemini-2.0-flash';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { image, mimeType } = await req.json();

    if (!image || !mimeType) {
      return new Response(
        JSON.stringify({ error: 'ต้องส่ง image (base64) และ mimeType' }),
        { status: 400, headers: { ...CORS, 'content-type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY ไม่ได้ตั้งค่าใน Supabase secrets' }),
        { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
      );
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: image,
                },
              },
              { text: EXTRACT_PROMPT },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[scan-invoice] Gemini error:', geminiRes.status, errText);
      // ส่ง 200 เพื่อให้ frontend แสดง error จริงๆ ได้
      return new Response(
        JSON.stringify({ _debug_error: true, status: geminiRes.status, detail: errText }),
        { status: 200, headers: { ...CORS, 'content-type': 'application/json' } }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: 'Gemini ไม่ส่งข้อมูลกลับมา', raw: geminiData }),
        { status: 422, headers: { ...CORS, 'content-type': 'application/json' } }
      );
    }

    // Gemini with responseMimeType=application/json ส่งกลับ JSON ตรงๆ
    // แต่ fallback parse เผื่อกรณีมี markdown block
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/```json\s*([\s\S]+?)\s*```/) ||
                        rawText.match(/```\s*([\s\S]+?)\s*```/) ||
                        rawText.match(/(\{[\s\S]+\})/);
      if (!jsonMatch) {
        return new Response(
          JSON.stringify({ error: 'ไม่สามารถอ่านข้อมูลจากบิลได้', raw: rawText }),
          { status: 422, headers: { ...CORS, 'content-type': 'application/json' } }
        );
      }
      parsed = JSON.parse(jsonMatch[1]);
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, 'content-type': 'application/json' },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
    );
  }
});
