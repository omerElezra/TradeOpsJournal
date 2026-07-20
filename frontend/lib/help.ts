// Hebrew hover explanations for measured metrics and KPIs across the app.
// Looked up by the exact display label — used by the Trade Context card, the
// entry-check context panel (components/trades/context-badges.tsx) and the
// dashboard/analytics metric cards (components/metrics/metric-card.tsx).

export const METRIC_HELP: Record<string, string> = {
  // ── Risk / Reward (trade context) ──
  "Planned Risk /sh": "ההפסד למניה אם הסטופ נפגע — המרחק בין מחיר הכניסה לסטופ המתוכנן",
  "Planned Reward /sh": "הרווח למניה אם הטרגט מושג — המרחק בין הכניסה לטרגט המתוכנן",
  "Planned R/R": "יחס סיכוי/סיכון מתוכנן — כמה דולר רווח פוטנציאלי על כל דולר סיכון. 2:1 ומעלה נחשב טוב",
  "Actual R": "התוצאה בפועל ביחידות סיכון — כמה פעמים את הסיכון המתוכנן הרווחת (חיובי) או הפסדת (שלילי)",

  // ── Stock context ──
  "MA Alignment": "סידור הממוצעים הנעים — BULLISH: מחיר מעל 20>50>150 (מגמה בריאה), BEARISH: הפוך, MIXED: מעורבב",
  "Above MA20 / 50 / 150": "האם המחיר מעל כל אחד מהממוצעים הנעים (20/50/150 יום)",
  "Dist MA20 / 50 / 150": "מרחק המחיר מכל ממוצע באחוזים — מרחק גדול מ-MA20 (7%+) אומר שהמניה מתוחה",
  "Return 5d / 20d / 60d": "תשואת המניה ב-5 / 20 / 60 ימי המסחר האחרונים",
  "Avg Volume 20d": "נפח מסחר יומי ממוצע ב-20 הימים האחרונים",
  "Entry Day Volume": "נפח המסחר ביום הכניסה לעסקה",
  "As-of Day Volume": "נפח המסחר ביום הנבדק (בבדיקה חיה — עשוי להיות חלקי)",
  "Relative Volume": "נפח היום חלקי הממוצע — מעל 1.1 = עניין מוגבר, מעל 2.5 = קלימקס",
  "ATR14 (ATR%)": "טווח התנודה היומי הממוצע ב-14 יום — כמה המניה זזה ביום רגיל. עוזר למקם סטופ ריאלי",

  // ── Market context ──
  SPY: "מגמת מדד S&P 500 — לפי מיקום מול ממוצעים 50/200",
  QQQ: "מגמת מדד הנאסד\"ק 100 — מניות הטכנולוגיה הגדולות",
  "Market Bias": "שילוב מגמות SPY ו-QQQ — הכיוון הכללי של השוק. רוב המניות זזות עם השוק",
  "Supports Trade": "האם כיוון השוק תומך בכיוון העסקה — לונג בשוק עולה / שורט בשוק יורד",
  VIX: "מדד הפחד — התנודתיות הצפויה בשוק. גבוה = שוק עצבני",
  "VIX at entry": "מדד הפחד בזמן הכניסה — התנודתיות הצפויה בשוק",
  "VIX Regime": "משטר תנודתיות: LOW < 15 (רגוע), NORMAL < 20, ELEVATED < 30 (מתוח), EXTREME 30+ (פאניקה)",
  "VIX 5d Change": "שינוי ה-VIX בחמשת הימים האחרונים — עלייה חדה = לחץ גובר בשוק",

  // ── Trade journey ──
  "High / Low": "השיא והשפל של המחיר במהלך חיי העסקה",
  MFE: "Maximum Favorable Excursion — הרווח הצף המקסימלי שהיה לך. כמה היה אפשר להרוויח בשיא",
  MAE: "Maximum Adverse Excursion — ההפסד הצף המקסימלי. כמה היית 'בפנים' בנקודה הגרועה ביותר",
  "Exit Efficiency": "כמה אחוז מהמהלך המקסימלי לטובתך תפסת ביציאה בפועל — מדד לאיכות היציאה",

  // ── Dashboard / analytics KPIs ──
  "Net P&L After Fees": "רווח/הפסד נקי אחרי עמלות על כל העסקאות בטווח",
  "Realized P&L": "רווח/הפסד ממומש מעסקאות סגורות בלבד",
  "Win Rate": "אחוז העסקאות שהסתיימו ברווח מתוך כל העסקאות הסגורות",
  "Profit Factor": "סך הרווחים חלקי סך ההפסדים — מעל 1 = רווחי, מעל 2 = מצוין",
  "Net ROI": "תשואה נטו על הכסף שהופקד לחשבון",
  "Est. Account Value": "שווי חשבון מוערך — הפקדות ועוד רווח/הפסד מצטבר",
  "Total Commission Paid": "סך העמלות ששולמו לברוקר בטווח הנבחר",
};

/** Section-level explanations on the context cards, by section title. */
export const METRIC_SECTION_HELP: Record<string, string> = {
  "Risk / Reward": "התוכנית מול התוצאה במונחי יחידות סיכון (R)",
  "Trade journey": "מה המחיר עשה בין הכניסה ליציאה — הרווח וההפסד הצפים המקסימליים",
  "Market at entry": "מצב השוק הכללי (מדדים + VIX) בזמן הכניסה לעסקה",
  Market: "מצב השוק הכללי (מדדים + VIX) בזמן הנבדק",
};
