/**
 * Phase 25F vaccine image i18n keys.
 * Default + en use English; nl is Dutch. es/zh rely on Default fallback.
 */
export type Phase25FKeySpec = {
  key: string
  en: string
  nl: string
}

export const PHASE_25F_I18N_KEYS: Phase25FKeySpec[] = [
  {
    key: 'vaccines.image.sectionTitle',
    en: 'Vaccine image',
    nl: 'Vaccinatie-afbeelding',
  },
  {
    key: 'vaccines.image.postCreateTitle',
    en: 'Add a vaccine image (optional)',
    nl: 'Vaccinatie-afbeelding toevoegen (optioneel)',
  },
  {
    key: 'vaccines.image.postCreateHint',
    en: 'The vaccine was created. You can upload an image now or skip this step.',
    nl: 'Het vaccin is aangemaakt. U kunt nu een afbeelding uploaden of deze stap overslaan.',
  },
  {
    key: 'vaccines.image.select',
    en: 'Select image',
    nl: 'Afbeelding selecteren',
  },
  {
    key: 'vaccines.image.upload',
    en: 'Upload image',
    nl: 'Afbeelding uploaden',
  },
  {
    key: 'vaccines.image.replace',
    en: 'Replace image',
    nl: 'Afbeelding vervangen',
  },
  {
    key: 'vaccines.image.replaceHint',
    en: 'The current image stays active until the new upload succeeds.',
    nl: 'De huidige afbeelding blijft actief tot de nieuwe upload slaagt.',
  },
  {
    key: 'vaccines.image.delete',
    en: 'Delete image',
    nl: 'Afbeelding verwijderen',
  },
  {
    key: 'vaccines.image.deleteConfirmTitle',
    en: 'Delete vaccine image?',
    nl: 'Vaccinatie-afbeelding verwijderen?',
  },
  {
    key: 'vaccines.image.deleteConfirmMessage',
    en: 'This removes the image from the catalogue. You can upload a new one later.',
    nl: 'Dit verwijdert de afbeelding uit de catalogus. U kunt later een nieuwe uploaden.',
  },
  {
    key: 'vaccines.image.delete.success',
    en: 'Image deleted.',
    nl: 'Afbeelding verwijderd.',
  },
  {
    key: 'vaccines.image.preview',
    en: 'Image preview',
    nl: 'Voorbeeld van afbeelding',
  },
  {
    key: 'vaccines.image.previewAlt',
    en: 'Selected image preview',
    nl: 'Voorbeeld van geselecteerde afbeelding',
  },
  {
    key: 'vaccines.image.submitUpload',
    en: 'Upload and analyse',
    nl: 'Uploaden en analyseren',
  },
  {
    key: 'vaccines.image.skip',
    en: 'Skip for now',
    nl: 'Nu overslaan',
  },
  {
    key: 'vaccines.image.done',
    en: 'Done',
    nl: 'Klaar',
  },
  {
    key: 'vaccines.image.none',
    en: 'No image uploaded yet.',
    nl: 'Nog geen afbeelding geüpload.',
  },
  {
    key: 'vaccines.image.placeholder',
    en: 'No vaccine image available',
    nl: 'Geen vaccinatie-afbeelding beschikbaar',
  },
  {
    key: 'vaccines.image.loading',
    en: 'Loading vaccine image',
    nl: 'Vaccinatie-afbeelding laden',
  },
  {
    key: 'vaccines.image.alt',
    en: 'Image of {name}',
    nl: 'Afbeelding van {name}',
  },
  {
    key: 'vaccines.image.reviewIndicator',
    en: 'Review',
    nl: 'Review',
  },
  {
    key: 'vaccines.image.statusLabel',
    en: 'Image status',
    nl: 'Afbeeldingsstatus',
  },
  {
    key: 'vaccines.image.status.pendingAnalysis',
    en: 'Pending analysis',
    nl: 'Analyse in behandeling',
  },
  {
    key: 'vaccines.image.status.accepted',
    en: 'Accepted',
    nl: 'Geaccepteerd',
  },
  {
    key: 'vaccines.image.status.reviewRequired',
    en: 'Manual review recommended',
    nl: 'Handmatige review aanbevolen',
  },
  {
    key: 'vaccines.image.status.rejected',
    en: 'Rejected',
    nl: 'Afgewezen',
  },
  {
    key: 'vaccines.image.status.analysisFailed',
    en: 'Analysis failed',
    nl: 'Analyse mislukt',
  },
  {
    key: 'vaccines.image.explanation.pendingAnalysis',
    en: 'The image is waiting for analysis.',
    nl: 'De afbeelding wacht op analyse.',
  },
  {
    key: 'vaccines.image.explanation.accepted',
    en: 'Azure found strong evidence that this is a vaccine or pharmaceutical product image.',
    nl: 'Azure vond sterke aanwijzingen dat dit een afbeelding van een vaccin of farmaceutisch product is.',
  },
  {
    key: 'vaccines.image.explanation.reviewRequired',
    en: 'The image appears medically relevant, but the system could not confidently confirm that it represents a vaccine.',
    nl: 'De afbeelding lijkt medisch relevant, maar het systeem kon niet met zekerheid bevestigen dat het een vaccin voorstelt.',
  },
  {
    key: 'vaccines.image.explanation.rejected',
    en: 'The image did not contain sufficient vaccine or pharmaceutical evidence.',
    nl: 'De afbeelding bevatte onvoldoende aanwijzingen voor een vaccin of farmaceutisch product.',
  },
  {
    key: 'vaccines.image.explanation.analysisFailed',
    en: 'The image could not be analysed. An administrator may retry or review it.',
    nl: 'De afbeelding kon niet worden geanalyseerd. Een beheerder kan het opnieuw proberen of handmatig beoordelen.',
  },
  {
    key: 'vaccines.image.aiReason',
    en: 'Analysis reason',
    nl: 'Analyseredenering',
  },
  {
    key: 'vaccines.image.aiCaption',
    en: 'Caption',
    nl: 'Bijschrift',
  },
  {
    key: 'vaccines.image.aiConfidence',
    en: 'Confidence',
    nl: 'Betrouwbaarheid',
  },
  {
    key: 'vaccines.image.aiTags',
    en: 'Tags',
    nl: 'Tags',
  },
  {
    key: 'vaccines.image.confidenceValue',
    en: '{value}%',
    nl: '{value}%',
  },
  {
    key: 'vaccines.image.upload.analysing',
    en: 'Uploading and analysing image…',
    nl: 'Afbeelding uploaden en analyseren…',
  },
  {
    key: 'vaccines.image.upload.accepted',
    en: 'Image accepted',
    nl: 'Afbeelding geaccepteerd',
  },
  {
    key: 'vaccines.image.upload.reviewRequired',
    en: 'Manual review recommended',
    nl: 'Handmatige review aanbevolen',
  },
  {
    key: 'vaccines.image.upload.rejected',
    en: 'Image rejected',
    nl: 'Afbeelding afgewezen',
  },
  {
    key: 'vaccines.image.upload.analysisFailed',
    en: 'Analysis failed',
    nl: 'Analyse mislukt',
  },
  {
    key: 'vaccines.image.upload.pendingAnalysis',
    en: 'Analysis pending',
    nl: 'Analyse in behandeling',
  },
  {
    key: 'vaccines.image.upload.completed',
    en: 'Upload completed',
    nl: 'Upload voltooid',
  },
  {
    key: 'vaccines.image.override',
    en: 'Override decision',
    nl: 'Beslissing overschrijven',
  },
  {
    key: 'vaccines.image.overrideTitle',
    en: 'Override image validation',
    nl: 'Afbeeldingsvalidatie overschrijven',
  },
  {
    key: 'vaccines.image.overrideDecision',
    en: 'Decision',
    nl: 'Beslissing',
  },
  {
    key: 'vaccines.image.overrideDecisionPlaceholder',
    en: 'Choose a decision',
    nl: 'Kies een beslissing',
  },
  {
    key: 'vaccines.image.overrideReason',
    en: 'Reason',
    nl: 'Reden',
  },
  {
    key: 'vaccines.image.overrideReasonCount',
    en: '{count} / {max} characters',
    nl: '{count} / {max} tekens',
  },
  {
    key: 'vaccines.image.override.accept',
    en: 'Accept image',
    nl: 'Afbeelding accepteren',
  },
  {
    key: 'vaccines.image.override.reject',
    en: 'Reject image',
    nl: 'Afbeelding afwijzen',
  },
  {
    key: 'vaccines.image.overrideConfirmTitle',
    en: 'Confirm override?',
    nl: 'Overschrijving bevestigen?',
  },
  {
    key: 'vaccines.image.overrideConfirmMessage',
    en: 'This replaces the automated validation result with your decision.',
    nl: 'Dit vervangt het geautomatiseerde validatieresultaat door uw beslissing.',
  },
  {
    key: 'vaccines.image.override.success',
    en: 'Override saved: {status}',
    nl: 'Overschrijving opgeslagen: {status}',
  },
  {
    key: 'validation.image.required',
    en: 'Choose an image file.',
    nl: 'Kies een afbeeldingsbestand.',
  },
  {
    key: 'validation.image.unsupportedType',
    en: 'Only JPEG, PNG or WebP images are allowed.',
    nl: 'Alleen JPEG-, PNG- of WebP-afbeeldingen zijn toegestaan.',
  },
  {
    key: 'validation.image.tooLarge',
    en: 'Image must be 5 MB or smaller.',
    nl: 'Afbeelding mag maximaal 5 MB zijn.',
  },
  {
    key: 'validation.image.overrideDecision.required',
    en: 'Choose an override decision.',
    nl: 'Kies een overschrijvingsbeslissing.',
  },
  {
    key: 'validation.image.overrideReason.required',
    en: 'A reason is required.',
    nl: 'Een reden is verplicht.',
  },
  {
    key: 'validation.image.overrideReason.maxLength',
    en: 'Reason must be at most 500 characters.',
    nl: 'Reden mag maximaal 500 tekens zijn.',
  },
  {
    key: 'errors.vaccineImage.unauthorized',
    en: 'Sign in again to manage vaccine images.',
    nl: 'Meld u opnieuw aan om vaccinatie-afbeeldingen te beheren.',
  },
  {
    key: 'errors.vaccineImage.forbidden',
    en: 'Only administrators can manage vaccine images.',
    nl: 'Alleen beheerders kunnen vaccinatie-afbeeldingen beheren.',
  },
  {
    key: 'errors.vaccineImage.rateLimited',
    en: 'Too many image requests. Please wait and try again.',
    nl: 'Te veel afbeeldingsverzoeken. Wacht even en probeer opnieuw.',
  },
  {
    key: 'errors.vaccineImage.network',
    en: 'Could not reach the server to manage the image.',
    nl: 'De server kon niet worden bereikt om de afbeelding te beheren.',
  },
  {
    key: 'errors.vaccineImage.fileRequired',
    en: 'An image file is required.',
    nl: 'Een afbeeldingsbestand is verplicht.',
  },
  {
    key: 'errors.vaccineImage.invalid',
    en: 'The image file is not valid.',
    nl: 'Het afbeeldingsbestand is ongeldig.',
  },
  {
    key: 'errors.vaccineImage.concurrent',
    en: 'The image was changed elsewhere. Refresh and try again.',
    nl: 'De afbeelding is elders gewijzigd. Vernieuw en probeer opnieuw.',
  },
  {
    key: 'errors.vaccineImage.notPresent',
    en: 'This vaccine has no image to override.',
    nl: 'Dit vaccin heeft geen afbeelding om te overschrijven.',
  },
  {
    key: 'errors.vaccineImage.overrideReason',
    en: 'Provide a valid override reason.',
    nl: 'Geef een geldige overschrijvingsreden op.',
  },
  {
    key: 'errors.vaccineImage.notFound',
    en: 'Vaccine not found.',
    nl: 'Vaccin niet gevonden.',
  },
  {
    key: 'errors.vaccineImage.tooLarge',
    en: 'The image is too large to upload.',
    nl: 'De afbeelding is te groot om te uploaden.',
  },
  {
    key: 'errors.vaccineImage.unsupportedType',
    en: 'This image type is not supported.',
    nl: 'Dit afbeeldingstype wordt niet ondersteund.',
  },
  {
    key: 'errors.vaccineImage.generic',
    en: 'Could not update the vaccine image.',
    nl: 'De vaccinatie-afbeelding kon niet worden bijgewerkt.',
  },
]
