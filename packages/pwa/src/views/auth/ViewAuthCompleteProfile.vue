<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import { UserRole } from '@vaccin-delivery/types'
import * as z from 'zod'

import { resolveProfileCompletionMode } from '@/composables/profile-completion-mode'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'

const route = useRoute()
const router = useRouter()
const { isAuthenticated } = useFirebase()
const {
  currentUser,
  createOwnUser,
  updateOwnUser,
  completeApothekerProfile,
  completeBezorgerProfile,
  loadCurrentUser,
  mapGraphQLError,
  getDefaultRouteForRole,
  missingProfile,
  loading: userLoading,
  initialized: userInitialized,
} = useCurrentUser()

const saving = ref(false)
const formError = ref<string | null>(null)

void loadCurrentUser(true)

const completionMode = computed(() =>
  resolveProfileCompletionMode({
    authReady: isAuthenticated.value,
    userLoading: userLoading.value,
    userInitialized: userInitialized.value,
    currentUser: currentUser.value,
    missingApplicationUser: missingProfile.value,
  }),
)

const isApothekerCompletion = computed(
  () =>
    completionMode.value === 'apotheker' ||
    completionMode.value === 'unregistered',
)

const isBezorgerCompletion = computed(
  () => completionMode.value === 'bezorger',
)

const showLoading = computed(
  () =>
    completionMode.value === 'loading' ||
    (!userInitialized.value && userLoading.value),
)

const apothekerSchema = z.object({
  firstName: z.string().min(2, 'Voornaam moet minstens 2 tekens bevatten.'),
  lastName: z.string().min(2, 'Achternaam moet minstens 2 tekens bevatten.'),
  pharmacyName: z.string().trim().min(1, 'Apotheeknaam is verplicht.').max(120),
  street: z.string().trim().min(1, 'Straat is verplicht.').max(120),
  houseNumber: z.string().trim().min(1, 'Huisnummer is verplicht.').max(20),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Postcode moet 4 cijfers zijn (België).'),
  city: z.string().trim().min(1, 'Gemeente is verplicht.').max(100),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Landcode moet 2 letters zijn.')
    .optional()
    .or(z.literal('')),
})

const bezorgerSchema = z.object({
  firstName: z.string().min(2, 'Voornaam moet minstens 2 tekens bevatten.'),
  lastName: z.string().min(2, 'Achternaam moet minstens 2 tekens bevatten.'),
  displayName: z.string().trim().min(1, 'Weergavenaam is verplicht.').max(120),
  vehicleLabel: z.string().trim().max(120).optional().or(z.literal('')),
})

type ApothekerForm = z.output<typeof apothekerSchema>
type BezorgerForm = z.output<typeof bezorgerSchema>

const apothekerState = reactive<Partial<ApothekerForm>>({
  firstName: undefined,
  lastName: undefined,
  pharmacyName: undefined,
  street: undefined,
  houseNumber: undefined,
  postalCode: undefined,
  city: undefined,
  country: 'BE',
})

const bezorgerState = reactive<Partial<BezorgerForm>>({
  firstName: undefined,
  lastName: undefined,
  displayName: undefined,
  vehicleLabel: undefined,
})

watch(
  currentUser,
  user => {
    if (!user) {
      return
    }

    apothekerState.firstName = user.firstName
    apothekerState.lastName = user.lastName
    bezorgerState.firstName = user.firstName
    bezorgerState.lastName = user.lastName

    if (user.apothekerProfile) {
      apothekerState.pharmacyName = user.apothekerProfile.pharmacyName
      apothekerState.street = user.apothekerProfile.address.street
      apothekerState.houseNumber = user.apothekerProfile.address.houseNumber
      apothekerState.postalCode = user.apothekerProfile.address.postalCode
      apothekerState.city = user.apothekerProfile.address.city
      apothekerState.country = user.apothekerProfile.address.country
    }

    if (user.bezorgerProfile) {
      bezorgerState.displayName = user.bezorgerProfile.displayName
      bezorgerState.vehicleLabel = user.bezorgerProfile.vehicleLabel ?? ''
    } else if (user.role === UserRole.Bezorger) {
      bezorgerState.displayName = `${user.firstName} ${user.lastName}`.trim()
    }
  },
  { immediate: true },
)

watch(completionMode, async mode => {
  if (mode === 'admin') {
    await router.replace(getDefaultRouteForRole(UserRole.Admin))
  }
})

async function ensureApplicationUser(
  firstName: string,
  lastName: string,
): Promise<void> {
  if (missingProfile.value || !currentUser.value) {
    await createOwnUser(firstName, lastName)
    return
  }

  if (
    currentUser.value.firstName !== firstName ||
    currentUser.value.lastName !== lastName
  ) {
    await updateOwnUser(firstName, lastName)
  }
}

async function onSubmitApotheker(event: FormSubmitEvent<ApothekerForm>) {
  if (
    currentUser.value &&
    currentUser.value.role !== UserRole.Apotheker
  ) {
    formError.value =
      'Dit account is geen apotheker. Herlaad de pagina om het juiste formulier te zien.'
    await loadCurrentUser(true)
    return
  }

  saving.value = true
  formError.value = null

  try {
    await ensureApplicationUser(event.data.firstName, event.data.lastName)

    if (currentUser.value?.role !== UserRole.Apotheker) {
      formError.value =
        'Je rol is geen APOTHEKER. Vul het bezorgerprofiel in in plaats van het apotheekprofiel.'
      await loadCurrentUser(true)
      return
    }

    await completeApothekerProfile({
      pharmacyName: event.data.pharmacyName,
      address: {
        street: event.data.street,
        houseNumber: event.data.houseNumber,
        postalCode: event.data.postalCode,
        city: event.data.city,
        country: event.data.country?.trim() || 'BE',
      },
    })

    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : getDefaultRouteForRole(UserRole.Apotheker)

    await router.push(redirect)
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    saving.value = false
  }
}

async function onSubmitBezorger(event: FormSubmitEvent<BezorgerForm>) {
  if (!currentUser.value || currentUser.value.role !== UserRole.Bezorger) {
    formError.value =
      'Dit account is geen bezorger. Herlaad de pagina om het juiste formulier te zien.'
    await loadCurrentUser(true)
    return
  }

  saving.value = true
  formError.value = null

  try {
    await ensureApplicationUser(event.data.firstName, event.data.lastName)

    if (currentUser.value?.role !== UserRole.Bezorger) {
      formError.value =
        'Je rol is geen BEZORGER. Vul het apotheekprofiel in in plaats van het bezorgerprofiel.'
      await loadCurrentUser(true)
      return
    }

    await completeBezorgerProfile({
      displayName: event.data.displayName,
      vehicleLabel: event.data.vehicleLabel?.trim()
        ? event.data.vehicleLabel
        : null,
    })

    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : getDefaultRouteForRole(UserRole.Bezorger)

    await router.push(redirect)
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Profiel aanvullen</h2>
    </template>

    <UAlert
      v-if="formError"
      class="mb-4"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <div v-if="showLoading" class="text-sm text-muted">Laden…</div>

    <template v-else-if="isBezorgerCompletion">
      <p class="mb-4 text-sm text-muted">
        Vul je bezorgergegevens aan om routes te kunnen ontvangen.
      </p>

      <UForm
        :schema="bezorgerSchema"
        :state="bezorgerState"
        class="space-y-4"
        @submit="onSubmitBezorger"
      >
        <UFormField label="Voornaam" name="firstName" required>
          <UInput
            v-model="bezorgerState.firstName"
            autocomplete="given-name"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Achternaam" name="lastName" required>
          <UInput
            v-model="bezorgerState.lastName"
            autocomplete="family-name"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Weergavenaam" name="displayName" required>
          <UInput v-model="bezorgerState.displayName" class="w-full" />
        </UFormField>

        <UFormField label="Voertuig (optioneel)" name="vehicleLabel">
          <UInput v-model="bezorgerState.vehicleLabel" class="w-full" />
        </UFormField>

        <UButton :loading="saving" block type="submit">
          Bezorgerprofiel opslaan
        </UButton>
      </UForm>
    </template>

    <template v-else-if="isApothekerCompletion">
      <p class="mb-4 text-sm text-muted">
        Vul je apotheekgegevens aan. Zonder apotheekprofiel zijn bestellingen
        mogelijk, maar routeplanning vereist een volledig adres.
      </p>

      <UForm
        :schema="apothekerSchema"
        :state="apothekerState"
        class="space-y-4"
        @submit="onSubmitApotheker"
      >
        <UFormField label="Voornaam" name="firstName" required>
          <UInput
            v-model="apothekerState.firstName"
            autocomplete="given-name"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Achternaam" name="lastName" required>
          <UInput
            v-model="apothekerState.lastName"
            autocomplete="family-name"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Apotheeknaam" name="pharmacyName" required>
          <UInput v-model="apothekerState.pharmacyName" class="w-full" />
        </UFormField>

        <UFormField label="Straat" name="street" required>
          <UInput
            v-model="apothekerState.street"
            autocomplete="address-line1"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Huisnummer" name="houseNumber" required>
          <UInput v-model="apothekerState.houseNumber" class="w-full" />
        </UFormField>

        <UFormField label="Postcode" name="postalCode" required>
          <UInput
            v-model="apothekerState.postalCode"
            autocomplete="postal-code"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Gemeente" name="city" required>
          <UInput
            v-model="apothekerState.city"
            autocomplete="address-level2"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Landcode" name="country">
          <UInput
            v-model="apothekerState.country"
            autocomplete="country"
            class="w-full"
            placeholder="BE"
          />
        </UFormField>

        <UButton :loading="saving" block type="submit">
          Apotheekprofiel opslaan
        </UButton>
      </UForm>
    </template>

    <p v-else class="text-sm text-muted">
      Geen rolspecifiek profiel vereist voor dit account.
    </p>
  </UCard>
</template>
