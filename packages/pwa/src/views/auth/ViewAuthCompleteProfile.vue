<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import { UserRole } from '@vaccin-delivery/types'
import * as z from 'zod'

import { useCurrentUser } from '@/composables/useCurrentUser'

const route = useRoute()
const router = useRouter()
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
} = useCurrentUser()

const loading = ref(false)
const formError = ref<string | null>(null)
const initialized = ref(false)

void loadCurrentUser(true).finally(() => {
  initialized.value = true
})

const isBezorgerCompletion = computed(() => {
  if (missingProfile.value || !currentUser.value) {
    return false
  }

  return currentUser.value.role === UserRole.Bezorger
})

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
  loading.value = true
  formError.value = null

  try {
    await ensureApplicationUser(event.data.firstName, event.data.lastName)

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
    loading.value = false
  }
}

async function onSubmitBezorger(event: FormSubmitEvent<BezorgerForm>) {
  loading.value = true
  formError.value = null

  try {
    await ensureApplicationUser(event.data.firstName, event.data.lastName)

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
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Profiel aanvullen</h2>
    </template>

    <p class="mb-4 text-sm text-muted">
      <template v-if="isBezorgerCompletion">
        Vul je bezorgergegevens aan om routes te kunnen ontvangen.
      </template>
      <template v-else>
        Vul je apotheekgegevens aan. Zonder apotheekprofiel zijn bestellingen
        mogelijk, maar routeplanning vereist een volledig adres.
      </template>
    </p>

    <UAlert
      v-if="formError"
      class="mb-4"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <div v-if="!initialized" class="text-sm text-muted">Laden…</div>

    <UForm
      v-else-if="isBezorgerCompletion"
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

      <UButton :loading="loading" block type="submit">
        Bezorgerprofiel opslaan
      </UButton>
    </UForm>

    <UForm
      v-else
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

      <UButton :loading="loading" block type="submit">
        Apotheekprofiel opslaan
      </UButton>
    </UForm>
  </UCard>
</template>
