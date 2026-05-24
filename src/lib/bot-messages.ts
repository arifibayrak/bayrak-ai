/**
 * src/lib/bot-messages.ts
 *
 * Turkish message catalog for the worker Telegram bot (I18N-01, D-26).
 * Single source of truth for all Turkish copy — edit here to tune wording.
 *
 * Tone: respectful "siz" form, plain and field-friendly, light emoji as
 * affordance cues (📷 photo, 📍 location).  See CONTEXT.md D-19/D-26.
 *
 * Interpolated messages use arrow functions so callers pass in runtime values
 * (name, unit) — avoids template-string placeholder anti-patterns.
 */

export const MESSAGES = {
  // ------------------------------------------------------------------
  // Greeting & identity
  // ------------------------------------------------------------------

  /** D-14 / D-26: personalized greeting at /start (name-interpolated). */
  greeting: (name: string) =>
    `Merhaba ${name}! 👷 Kayıt göndermek için bir proje seçin:`,

  /** Unregistered worker — pending approval */
  pendingApproval:
    'Hesabınız onay bekliyor. Yöneticinize başvurun.',

  /** No active flow — sent when a message arrives with no conversation state */
  noActiveFlow:
    'Aktif bir kayıt yok. /start komutunu kullanarak başlayın.',

  // ------------------------------------------------------------------
  // Flow start / resume
  // ------------------------------------------------------------------

  /** D-15: /start while a flow is already in progress */
  startInProgress:
    'Devam eden bir kayıt var. Ne yapmak istersiniz?',

  /** D-14: resume prefix — prepended when reprompting the current step */
  resumePrefix: 'Devam ediyoruz — ',

  // ------------------------------------------------------------------
  // Step prompts
  // ------------------------------------------------------------------

  /** LOG-02: project selection prompt */
  chooseProject: 'Projenizi seçin:',

  /** LOG-03: BOQ item selection prompt */
  chooseBoqItem: 'Kalem seçin:',

  /** D-25: exhausted BOQ item soft warning */
  exhaustedBoqWarning:
    'Bu kalem tamamlandı (0 kaldı). Yine de devam?',

  /** LOG-04: photo step prompt */
  promptPhoto:
    'Lütfen fotoğraf gönderin 📷 (yazı değil)',

  /** LOG-04: rejection when non-photo is received during photo step */
  rejectNotPhoto:
    'Fotoğraf gerekmektedir. Lütfen fotoğraf çekip gönderin 📷',

  /** LOG-05: location step prompt */
  promptLocation:
    'Konumunuzu paylaşın 📍 — 📎 → Konum',

  /** LOG-05: rejection when non-location is received during location step */
  rejectNotLocation:
    'Konum gerekmektedir. Telegram\'dan konum paylaşın: 📎 → Konum',

  /** LOG-06: quantity prompt (unit-interpolated) */
  promptQuantity: (unit: string) =>
    `Kaç ${unit}?`,

  /** LOG-06: rejection when non-numeric quantity is entered */
  rejectNotNumeric:
    'Geçerli bir sayı girin',

  /** LOG-07: notes step prompt (with skip affordance per D-21) */
  promptNotes:
    'Not eklemek ister misiniz? Yazın veya "Atla" butonuna basın.',

  // ------------------------------------------------------------------
  // Confirm step
  // ------------------------------------------------------------------

  /** D-16: confirmation summary header */
  confirmSummary:
    'Kaydınızı onaylıyor musunuz? Düzenlemek için bir alana dokunun:',

  // ------------------------------------------------------------------
  // Outcomes
  // ------------------------------------------------------------------

  /** D-18: successful submission confirmation */
  sent: 'Gönderildi ✅',

  /** D-17: cancellation confirmation */
  cancelled: 'İptal edildi',

  // ------------------------------------------------------------------
  // Navigation buttons
  // ------------------------------------------------------------------

  /** D-21: skip notes button label */
  skipNotes: 'Atla',

  /** D-15: continue existing flow button label */
  continueFlow: 'Devam et',

  /** D-15: restart flow button label */
  restartFlow: 'Baştan başla',

  /** D-18: start a new log after successful submission */
  newLog: 'Yeni kayıt',

  // ------------------------------------------------------------------
  // Edit buttons (D-16 per-field jump back from confirm step)
  // ------------------------------------------------------------------

  editPhoto: 'Fotoğrafı değiştir',
  editLocation: 'Konumu değiştir',
  editQuantity: 'Miktarı düzelt',
  editNotes: 'Notu düzelt',

  // ------------------------------------------------------------------
  // Generic error / fallback
  // ------------------------------------------------------------------

  /** Catch-all error message */
  genericError:
    'Bir hata oluştu. Lütfen tekrar deneyin.',

  /** Photo upload failed */
  photoUploadError:
    'Fotoğraf yüklenemedi. Lütfen tekrar gönderin 📷',

  // ------------------------------------------------------------------
  // Phase 3: Audit Loop (D-26 tone: respectful "siz", light emoji)
  // ------------------------------------------------------------------

  /** AUDIT-02 / D-28: over-delivery warning in auditor notification caption */
  auditOverDelivery: (newTotal: number, planned: number, unit: string) =>
    `⚠ Sözleşmeyi aşıyor (${newTotal}/${planned} ${unit})`,

  /** AUDIT-05 / D-30: auditor canned reason prompt (shown after ❌ Reddet tap) */
  auditRejectPrompt:
    'Ret gerekçesini seçin:',

  /** AUDIT-05 / D-30: free-text reason prompt (shown after "Başka (yaz)" selection) */
  auditRejectFreeTextPrompt:
    'Lütfen ret gerekçenizi yazın:',

  /** AUDIT-03 / D-36: unauthorized auditor tap toast */
  auditUnauthorized:
    'Yetkisiz erişim',

  /** AUDIT-06 / D-29: late or duplicate tap toast (already resolved) */
  auditAlreadyResolved:
    'Bu kayıt zaten çözüldü',

  /** AUDIT-04: outcome text for sibling-message edit on approve */
  auditApprovedOutcome: (auditorName: string) =>
    `✅ Onaylandı — ${auditorName}`,

  /** AUDIT-05: outcome text for sibling-message edit on reject */
  auditRejectedOutcome: (auditorName: string, reason: string) =>
    `❌ Reddedildi — ${auditorName}: ${reason}`,

  /** AUDIT-04 / D-37: worker notification on approve */
  workerApproved:
    '✅ Kaydınız onaylandı.',

  /** AUDIT-05 / D-37: worker notification on reject */
  workerRejected: (reason: string) =>
    `❌ Kaydınız reddedildi: ${reason}`,
} as const;
