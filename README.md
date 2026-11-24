# MAKTABY PRO 10.9.1 — Web Source

نسخة مصدر الويب الخاصة بمشروع مكتبي للمحاماة.

## التشغيل والبناء

```bash
npm install
npm run dev
npm run build
npm run preview
npm run qa
```

- المصدر داخل `src/`.
- ملفات النشر الثابتة داخل `public/`.
- الاختبارات داخل `tests/`.
- التوثيق داخل `docs/`.
- Vite ينتج الملفات ذات البصمات داخل `dist/`، ويولّد Service Worker آليًا.

لا ترفع ملفات المصدر مباشرة إلى الاستضافة؛ انشر محتويات `dist/` فقط بعد نجاح `npm run build` واختبار التشغيل.

## آخر تحديث معماري
راجع `docs/ARCHITECTURE_STAGE_2_LAZY_FEATURES_AR.md` لتفاصيل فصل CRM وتقارير الإنجازات والاختبارات وحدود البناء في هذه البيئة.
