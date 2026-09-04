import {
  CONTACT_PERMISSION_NAMES,
  INTAKE_FIELD_NAMES,
  OPTIONAL_FIELD_NAMES,
  REQUIRED_FIELD_NAMES,
  type FieldProvenance,
  type InquiryDraft,
  type InquiryReviewPayload,
  type InquirySnapshot,
  type IntakeFieldName,
  type OptionalDisclosureAuthorizations,
  type OptionalFieldName,
} from './types'

export interface DisclosureSnapshotDetails {
  snapshot: InquirySnapshot
  disclosedFields: IntakeFieldName[]
  authorizedOptionalFields: OptionalFieldName[]
  withheldOptionalFields: OptionalFieldName[]
}

/** Applies human disclosure decisions to a complete normalized inquiry. */
export function buildDisclosureSnapshot(
  completeDraft: InquirySnapshot,
  authorizations: OptionalDisclosureAuthorizations,
): DisclosureSnapshotDetails {
  const snapshot: InquirySnapshot = {
    contactName: completeDraft.contactName,
    email: completeDraft.email,
    inquiryType: completeDraft.inquiryType,
    desiredOutcome: completeDraft.desiredOutcome,
    relevantBackground: completeDraft.relevantBackground,
    timeline: completeDraft.timeline,
    preferredResponseMethod: completeDraft.preferredResponseMethod,
    requestedNextStep: completeDraft.requestedNextStep,
  }

  const authorizedOptionalFields = OPTIONAL_FIELD_NAMES.filter(
    (field) => authorizations[field],
  )
  for (const field of authorizedOptionalFields) {
    const value = completeDraft[field]
    if (value !== undefined) snapshot[field] = value
  }

  const disclosedFields = INTAKE_FIELD_NAMES.filter(
    (field) => snapshot[field] !== undefined,
  )
  const withheldOptionalFields = OPTIONAL_FIELD_NAMES.filter(
    (field) => snapshot[field] === undefined,
  )

  return {
    snapshot,
    disclosedFields,
    authorizedOptionalFields,
    withheldOptionalFields,
  }
}

/** Stable field-only serialization retained for display and focused tests. */
export function canonicalSerialize(snapshot: InquirySnapshot): string {
  return JSON.stringify(
    Object.fromEntries(
      INTAKE_FIELD_NAMES.flatMap((field) => {
        const value = snapshot[field]
        return value === undefined ? [] : [[field, value] as const]
      }),
    ),
  )
}

function canonicalFieldProvenance(
  provenance: Partial<Record<IntakeFieldName, FieldProvenance>>,
): Record<string, FieldProvenance> {
  return Object.fromEntries(
    INTAKE_FIELD_NAMES.flatMap((field) => {
      const value = provenance[field]
      if (!value) return []
      return [
        [
          field,
          {
            source: value.source,
            verifiedByHuman: value.verifiedByHuman,
            updatedAt: value.updatedAt,
            ...(value.verifiedAt ? { verifiedAt: value.verifiedAt } : {}),
          },
        ] as const,
      ]
    }),
  )
}

/**
 * Canonicalizes every execution-affecting review decision. The digest therefore
 * binds values, disclosure choices, contact permissions, intent, and provenance.
 */
export function canonicalSerializeReviewPayload(
  payload: InquiryReviewPayload,
): string {
  return JSON.stringify({
    snapshot: JSON.parse(canonicalSerialize(payload.snapshot)) as object,
    optionalDisclosureAuthorizations: Object.fromEntries(
      OPTIONAL_FIELD_NAMES.map((field) => [
        field,
        payload.optionalDisclosureAuthorizations[field],
      ]),
    ),
    contactPermissions: Object.fromEntries(
      CONTACT_PERMISSION_NAMES.map((permission) => [
        permission,
        payload.contactPermissions[permission],
      ]),
    ),
    nextStepIntentConfirmed: payload.nextStepIntentConfirmed,
    inquiryProvenance: {
      entrySource: payload.inquiryProvenance.entrySource,
      referralSource: payload.inquiryProvenance.referralSource,
      campaign: payload.inquiryProvenance.campaign,
    },
    fieldProvenance: canonicalFieldProvenance(payload.fieldProvenance),
  })
}

/** Digest is a local change detector, not identity or tamper-proof evidence. */
export async function sha256Digest(canonicalPayload: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable in this browser.')
  }

  const bytes = new TextEncoder().encode(canonicalPayload)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function hasSameDisclosure(
  draft: InquiryDraft,
  authorizations: OptionalDisclosureAuthorizations,
  reviewSnapshot: InquirySnapshot,
): boolean {
  if (!REQUIRED_FIELD_NAMES.every((field) => draft[field] !== undefined)) {
    return false
  }

  return (
    canonicalSerialize(reviewSnapshot) ===
    canonicalSerialize(
      buildDisclosureSnapshot(
        draft as InquirySnapshot,
        authorizations,
      ).snapshot,
    )
  )
}
