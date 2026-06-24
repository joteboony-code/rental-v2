// Low-level send — caller provides pre-fetched and decrypted credentials
export async function sendOwnerTelegramMessage(text: string, token: string, chatId: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[telegram]', res.status, body)
    }
  } catch (e) {
    console.error('[telegram]', e)
  }
}
