<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import type { FormSubmitEvent } from '@nuxt/ui'
import { UserRole } from '@vaccin-delivery/types'
import * as z from 'zod'

import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const { isOnline } = useOnlineStatus()

const {
  currentUser,
  loading,
  loadCurrentUser,
  updateOwnUser,
  updateOwnApothekerProfile,
  updateOwnBezorgerProfile,
  mapGraphQLError,
} = useCurrentUser()

const saving = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const adminSchema = z.object({
  firstName: z.string().min(2, 'Voornaam moet minstens 2 tekens bevatten.'),
  lastName: z.string().min(2, 'Achternaam moet minstens 2 tekens bevatten.'),
})

const apothekerSchema = adminSchema.extend({
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
    .regex(/^[A-Za-z]{2}$/, 'Landcode moet 2 letters zijn.'),
})

const bezorgerSchema = adminSchema.extend({
  displayName: z.string().trim().min(1, 'Weergavenaam is verplicht.').max(120),
  vehicleLabel: z.string().trim().max(120).optional().or(z.literal('')),
})

type AdminForm = z.output<typeof adminSchema>
type ApothekerForm = z.output<typeof apothekerSchema>
type BezorgerForm = z.output<typeof bezorgerSchema>

const adminState = reactive<Partial<AdminForm>>({
  firstName: undefined,
  lastName: undefined,
})

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

const roleLabel = computed(() => {
  switch (currentUser.value?.role) {
    case UserRole.Admin:
      return 'Administrator'
    case UserRole.Bezorger:
      return 'Bezorger'
    default:
      return 'Apotheker'
  }
})

const isApotheker = computed(
  () => currentUser.value?.role === UserRole.Apotheker,
)
const isBezorger = computed(
  () => currentUser.value?.role === UserRole.Bezorger,
)

watch(
  currentUser,
  user => {
    if (!user) {
      return
    }

    adminState.firstName = user.firstName
    adminState.lastName = user.lastName

    apothekerState.firstName = user.firstName
    apothekerState.lastName = user.lastName
    if (user.apothekerProfile) {
      apothekerState.pharmacyName = user.apothekerProfile.pharmacyName
      apothekerState.street = user.apothekerProfile.address.street
      apothekerState.houseNumber = user.apothekerProfile.address.houseNumber
      apothekerState.postalCode = user.apothekerProfile.address.postalCode
      apothekerState.city = user.apothekerProfile.address.city
      apothekerState.country = user.apothekerProfile.address.country
    }

    bezorgerState.firstName = user.firstName
    bezorgerState.lastName = user.lastName
    if (user.bezorgerProfile) {
      bezorgerState.displayName = user.bezorgerProfile.displayName
      bezorgerState.vehicleLabel = user.bezorgerProfile.vehicleLabel ?? ''
    }
  },
  { immediate: true },
)

void loadCurrentUser()

async function onSubmitAdmin(event: FormSubmitEvent<AdminForm>) {
  saving.value = true
  formError.value = null
  successMessage.value = null

  try {
    await updateOwnUser(event.data.firstName, event.data.lastName)
    successMessage.value = 'Profiel succesvol bijgewerkt.'
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    saving.value = false
  }
}

async function onSubmitApotheker(event: FormSubmitEvent<ApothekerForm>) {
  saving.value = true
  formError.value = null
  successMessage.value = null

  try {
    await updateOwnUser(event.data.firstName, event.data.lastName)
    await updateOwnApothekerProfile({
      pharmacyName: event.data.pharmacyName,
      address: {
        street: event.data.street,
        houseNumber: event.data.houseNumber,
        postalCode: event.data.postalCode,
        city: event.data.city,
        country: event.data.country,
      },
    })
    successMessage.value = 'Apotheekprofiel succesvol bijgewerkt.'
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    saving.value = false
  }
}

async function onSubmitBezorger(event: FormSubmitEvent<BezorgerForm>) {
  saving.value = true
  formError.value = null
  successMessage.value = null

  try {
    await updateOwnUser(event.data.firstName, event.data.lastName)
    await updateOwnBezorgerProfile({
      displayName: event.data.displayName,
      vehicleLabel: event.data.vehicleLabel?.trim()
        ? event.data.vehicleLabel
        : null,
    })
    successMessage.value = 'Bezorgerprofiel succesvol bijgewerkt.'
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Profiel</h2>
      </template>

      <CommonLoadingSkeleton v-if="loading" />

      <template v-else-if="currentUser">
        <UAlert
          v-if="successMessage"
          class="mb-4"
          color="success"
          variant="subtle"
          :title="successMessage"
        />

        <UAlert
          v-if="formError"
          class="mb-4"
          color="error"
          variant="subtle"
          :title="formError"
        />

        <div class="mb-4 space-y-2 text-sm">
          <p>
            <span class="font-medium">E-mail:</span>
            {{ currentUser.email }}
          </p>
          <p>
            <span class="font-medium">Rol:</span>
            {{ roleLabel }} ({{ currentUser.role }})
          </p>
        </div>

        <UForm
          v-if="isApotheker"
          :schema="apothekerSchema"
          :state="apothekerState"
          class="space-y-4"
          @submit="onSubmitApotheker"
        >
          <UFormField label="Voornaam" name="firstName" required>
            <UInput v-model="apothekerState.firstName" class="w-full" />
          </UFormField>

          <UFormField label="Achternaam" name="lastName" required>
            <UInput v-model="apothekerState.lastName" class="w-full" />
          </UFormField>

          <UFormField label="Apotheeknaam" name="pharmacyName" required>
            <UInput v-model="apothekerState.pharmacyName" class="w-full" />
          </UFormField>

          <UFormField label="Straat" name="street" required>
            <UInput v-model="apothekerState.street" class="w-full" />
          </UFormField>

          <UFormField label="Huisnummer" name="houseNumber" required>
            <UInput v-model="apothekerState.houseNumber" class="w-full" />
          </UFormField>

          <UFormField label="Postcode" name="postalCode" required>
            <UInput v-model="apothekerState.postalCode" class="w-full" />
          </UFormField>

          <UFormField label="Gemeente" name="city" required>
            <UInput v-model="apothekerState.city" class="w-full" />
          </UFormField>

          <UFormField label="Landcode" name="country" required>
            <UInput v-model="apothekerState.country" class="w-full" />
          </UFormField>

          <UButton :loading="saving" type="submit" :disabled="!isOnline">
            Wijzigingen opslaan
          </UButton>
        </UForm>

        <UForm
          v-else-if="isBezorger"
          :schema="bezorgerSchema"
          :state="bezorgerState"
          class="space-y-4"
          @submit="onSubmitBezorger"
        >
          <UFormField label="Voornaam" name="firstName" required>
            <UInput v-model="bezorgerState.firstName" class="w-full" />
          </UFormField>

          <UFormField label="Achternaam" name="lastName" required>
            <UInput v-model="bezorgerState.lastName" class="w-full" />
          </UFormField>

          <UFormField label="Weergavenaam" name="displayName" required>
            <UInput v-model="bezorgerState.displayName" class="w-full" />
          </UFormField>

          <UFormField label="Voertuig (optioneel)" name="vehicleLabel">
            <UInput v-model="bezorgerState.vehicleLabel" class="w-full" />
          </UFormField>

          <UButton :loading="saving" type="submit" :disabled="!isOnline">
            Wijzigingen opslaan
          </UButton>
        </UForm>

        <UForm
          v-else
          :schema="adminSchema"
          :state="adminState"
          class="space-y-4"
          @submit="onSubmitAdmin"
        >
          <UFormField label="Voornaam" name="firstName" required>
            <UInput v-model="adminState.firstName" class="w-full" />
          </UFormField>

          <UFormField label="Achternaam" name="lastName" required>
            <UInput v-model="adminState.lastName" class="w-full" />
          </UFormField>

          <UButton :loading="saving" type="submit" :disabled="!isOnline">
            Wijzigingen opslaan
          </UButton>
        </UForm>
      </template>

      <CommonErrorState
        v-else
        title="Profiel niet beschikbaar"
        description="Log opnieuw in of voltooi je profiel."
      />
    </UCard>
  </div>
</template>
