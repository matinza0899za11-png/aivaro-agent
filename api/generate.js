export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "فقط درخواست POST مجاز است." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "تنظیمات سرور کامل نیست؛ مدیر باید کلید API را تنظیم کند." });

  const body = req.body || {};
  const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const mode = body.mode === "revise" ? "revise" : "generate";
  const business = clean(body.business, 100);
  const type = clean(body.type, 150);
  const audience = clean(body.audience, 250);
  const goal = clean(body.goal, 100);
  const notes = clean(body.notes, 1200);
  const revision = clean(body.revision, 1000);

  if (!business || !type || !audience) {
    return res.status(400).json({ error: "نام کسب‌وکار، نوع فعالیت و مخاطب هدف الزامی است." });
  }

  const previous = body.previous && typeof body.previous === "object" ? body.previous : {};
  const system = `تو دستیار بازاریابی فارسی Aivaro هستی. فقط محتوای تبلیغاتی فارسی روان و کاربردی بساز. ادعای اثبات‌نشده، تخفیف ساختگی، تضمین فروش یا اطلاعاتی که کاربر نداده نساز. سناریوی ویدیو باید دقیقاً ۱۵ ثانیه و به سه صحنه با زمان‌بندی تقسیم شود. خروجی را فقط به صورت JSON معتبر با کلیدهای ideas, adCopy, video, caption برگردان؛ هر مقدار رشته فارسی باشد. ideas شامل دقیقاً سه ایده شماره‌گذاری‌شده باشد. caption شامل کپشن و دعوت به اقدام باشد.`;
  const user = mode === "revise"
    ? `محتوای قبلی را با توجه به اصلاح زیر بازنویسی کن.\nاطلاعات کسب‌وکار: ${business}؛ ${type}؛ مخاطب: ${audience}؛ هدف: ${goal}؛ توضیحات: ${notes}\nمحتوای قبلی: ${JSON.stringify(previous)}\nاصلاح موردنظر: ${revision}`
    : `برای این کسب‌وکار محتوا بساز.\nنام: ${business}\nفعالیت: ${type}\nمخاطب: ${audience}\nهدف: ${goal}\nتوضیحات: ${notes || "ارائه نشده"}`;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
        max_tokens: 1800,
        system,
        messages: [{ role: "user", content: user }]
      })
    });

    const result = await upstream.json();
    if (!upstream.ok) {
      console.error("Anthropic API error status:", upstream.status);
      return res.status(502).json({ error: "سرویس هوش مصنوعی در دسترس نیست یا تنظیمات API مشکل دارد. مدیر باید وضعیت حساب و کلید را بررسی کند." });
    }
    const raw = (result.content || []).filter(part => part.type === "text").map(part => part.text).join("\n").trim();
    const normalized = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let parsed;
    try { parsed = JSON.parse(normalized); }
    catch {
      console.error("Model response was not valid JSON.");
      return res.status(502).json({ error: "پاسخ هوش مصنوعی در قالب مورد انتظار نبود؛ دوباره تلاش کنید." });
    }
    const output = {};
    for (const key of ["ideas", "adCopy", "video", "caption"]) {
      if (typeof parsed[key] !== "string") return res.status(502).json({ error: "بخشی از خروجی ناقص بود؛ دوباره تلاش کنید." });
      output[key] = parsed[key].slice(0, 7000);
    }
    return res.status(200).json(output);
  } catch (error) {
    console.error("Request failed:", error && error.name ? error.name : "unknown");
    return res.status(502).json({ error: "ارتباط با سرویس برقرار نشد؛ اتصال اینترنت را بررسی و دوباره تلاش کنید." });
  }
      }
