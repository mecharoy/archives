/* The nightly run's small rules, kept apart from run.mjs so they can be checked without a network or a
   model: how long Baba has been quiet, the toast that tells the son, and what kind of brief went out. */

const DAY = 86400000

/** Whole Kolkata days from his last entry to today (both YYYY-MM-DD); null when he has never written. */
export function quietDays(lastEntryDate, todayIst) {
  if (!lastEntryDate) return null
  return Math.round((Date.parse(todayIst + 'T00:00:00Z') - Date.parse(lastEntryDate + 'T00:00:00Z')) / DAY)
}

/** Two days with nothing written is when the son should hear about it. A book never started is not quiet. */
export function shouldAlert(days) {
  return days !== null && days >= 2
}

/** A PowerShell script that shows a Windows toast with the built-in notification API — no module to
    install. Text goes inside single-quoted PowerShell strings, where a quote is written twice. */
export function toastScript(title, text) {
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"
  const app = q('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe')
  return [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
    "$x = $t.GetElementsByTagName('text')",
    `$x.Item(0).AppendChild($t.CreateTextNode(${q(title)})) | Out-Null`,
    `$x.Item(1).AppendChild($t.CreateTextNode(${q(text)})) | Out-Null`,
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${app}).Show([Windows.UI.Notifications.ToastNotification]::new($t))`,
  ].join('; ')
}

/** 'model' when the model's sentences were used; 'rule' when the brief fell back to the plain headline. */
export function briefBy({ wrote, plain }) {
  return wrote && !plain ? 'model' : 'rule'
}
