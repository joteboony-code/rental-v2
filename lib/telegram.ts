// Low-level send — caller provides pre-fetched and decrypted credentials
export async function sendOwnerTelegramMessage(
  text: string,
  token: string,
  chatId: string,
  link?: { label: string; url: string }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = { chat_id: chatId, text }
    if (link?.url) {
      payload.reply_markup = { inline_keyboard: [[{ text: link.label, url: link.url }]] }
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[telegram]', res.status, errBody)
    }
  } catch (e) {
    console.error('[telegram]', e)
  }
}
