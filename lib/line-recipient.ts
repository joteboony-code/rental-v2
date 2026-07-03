export type TenantLineRecipient = {
  line_user_id: string | null
}

export type ContractLineRecipient = {
  line_recipient_user_id: string | null
}

export function getEffectiveLineUserId(
  contract: ContractLineRecipient | null | undefined,
  tenant: TenantLineRecipient | null | undefined
): string | null {
  return contract?.line_recipient_user_id ?? tenant?.line_user_id ?? null
}
