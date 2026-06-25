// Supabase Edge Function: scan-invoice
// รับรูปภาพบิลยา → ส่งให้ AI Vision → return structured JSON
// Provider เลือกได้ผ่าน env SCAN_PROVIDER ('claude' default | 'gemini') — ดู docs/adr/0006
// Deploy: supabase functions deploy scan-invoice
// Secret (claude): supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Secret (gemini): supabase secrets set GEMINI_API_KEY=AIza...

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
const CLAUDE_MODEL = 'claude-opus-4-8';

// Anthropic image block รองรับแค่ 4 ชนิดนี้ — มือถือ (HEIC) / bmp / tiff ไม่ผ่าน
const CLAUDE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// แยก JSON ออกจาก text ที่อาจมี markdown block ห่อ — ใช้ร่วมกันทั้ง 2 provider
function extractJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/```json\s*([\s\S]+?)\s*```/) ||
                      rawText.match(/```\s*([\s\S]+?)\s*```/) ||
                      rawText.match(/(\{[\s\S]+\})/);
    if (!jsonMatch) throw new Error('ไม่สามารถอ่านข้อมูลจากบิลได้');
    return JSON.parse(jsonMatch[1]);
  }
}

// --- Provider: Claude (Anthropic Messages API) ---
async function callClaude(image: string, mimeType: string, apiKey: string) {
  if (!CLAUDE_IMAGE_TYPES.has((mimeType || '').toLowerCase())) {
    return { _error: {
      status: 400, provider: 'claude',
      detail: `ไฟล์ชนิด ${mimeType || 'นี้'} ไม่รองรับ — แปลงเป็น JPG หรือ PNG ก่อน (มือถือบางรุ่นถ่ายเป็น HEIC)`,
    } };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8192, // เผื่อบิลรายการเยอะ — JSON ยาวไม่ถูกตัดกลาง
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
          { type: 'text', text: EXTRACT_PROMPT },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return { _error: { status: res.status, detail, provider: 'claude' } };
  }

  const data = await res.json();
  // Messages API: content เป็น array ของ block — ดึง text block แรก
  const rawText: string = (data.content || [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('') || '';
  if (!rawText) return { _empty: data };
  try {
    return { json: extractJson(rawText) };
  } catch {
    return { _error: { status: 422, detail: 'ไม่สามารถอ่านข้อมูลจากบิลได้ (รูปไม่ชัด/ไม่ใช่บิล)', provider: 'claude' } };
  }
}

// --- Provider: Gemini (Google Generative Language API) ---
async function callGemini(image: string, mimeType: string, apiKey: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: image } },
            { text: EXTRACT_PROMPT },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    return { _error: { status: res.status, detail, provider: 'gemini' } };
  }

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) return { _empty: data };
  try {
    return { json: extractJson(rawText) };
  } catch {
    return { _error: { status: 422, detail: 'ไม่สามารถอ่านข้อมูลจากบิลได้ (รูปไม่ชัด/ไม่ใช่บิล)', provider: 'gemini' } };
  }
}

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

    const provider = (Deno.env.get('SCAN_PROVIDER') ?? 'claude').toLowerCase();
    const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
    const apiKey = Deno.env.get(keyName);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `${keyName} ไม่ได้ตั้งค่าใน Supabase secrets` }),
        { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
      );
    }

    const result = provider === 'gemini'
      ? await callGemini(image, mimeType, apiKey)
      : await callClaude(image, mimeType, apiKey);

    // ส่ง 200 พร้อม debug เพื่อให้ frontend แสดง error จริงได้ (เหมือน contract เดิม)
    if (result._error) {
      console.error(`[scan-invoice] ${provider} error:`, result._error.status, result._error.detail);
      return new Response(
        JSON.stringify({ _debug_error: true, ...result._error }),
        { status: 200, headers: { ...CORS, 'content-type': 'application/json' } }
      );
    }

    if (result._empty) {
      return new Response(
        JSON.stringify({ error: `${provider} ไม่ส่งข้อมูลกลับมา`, raw: result._empty }),
        { status: 422, headers: { ...CORS, 'content-type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(result.json), {
      headers: { ...CORS, 'content-type': 'application/json' },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
    );
  }
});
