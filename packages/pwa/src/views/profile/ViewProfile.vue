<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FormSubmitEvent } from '@nuxt/ui'
import { UserRole } from '@vaccin-delivery/types'
import type * as z from 'zod'

import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPushNotificationSettings from '@/components/common/CommonPushNotificationSettings.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import {
  createApothekerProfileSchema,
  createBezorgerProfileSchema,
  createNameFieldsSchema,
  userRoleLabel,
} from '@/i18n'

const { t } = useI18n()
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

const adminSchema = computed(() => createNameFieldsSchema(key => t(key)))
const apothekerSchema = computed(() =>
  createApothekerProfileSchema(key => t(key)),
)
const bezorgerSchema = computed(() =>
  createBezorgerProfileSchema(key => t(key)),
)

type AdminForm = z.output<ReturnType<typeof createNameFieldsSchema>>
type ApothekerForm = z.output<ReturnType<typeof createApothekerProfileSchema>>
type BezorgerForm = z.output<ReturnType<typeof createBezorgerProfileSchema>>

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

const roleLabel = computed(() =>
  currentUser.value ? userRoleLabel(currentUser.value.role) : '',
)

const isApotheker = computed(
  () => currentUser.value?.role === UserRole.Apotheker,
)
const isBezorger = computed(() => currentUser.value?.role === UserRole.Bezorger)

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
    successMessage.value = t('success.profile.updated')
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
    successMessage.value = t('success.profile.apotheker.updated')
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
    successMessage.value = t('success.profile.bezorger.updated')
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
        <h2 class="text-lg font-semibold">{{ t('title.profile') }}</h2>
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
            <span class="font-medium">{{ t('profiles.email.label') }}:</span>
            {{ currentUser.email }}
          </p>
          <p>
            <span class="font-medium">{{ t('profiles.role.label') }}:</span>
            {{ roleLabel }} ({{ currentUser.role }})
          </p>
        </div>

        <div class="mb-6">
          <CommonPushNotificationSettings />
        </div>

        <UForm
          v-if="isApotheker"
          :schema="apothekerSchema"
          :state="apothekerState"
          class="space-y-4"
          @submit="onSubmitApotheker"
        >
          <UFormField :label="t('label.first.name')" name="firstName" required>
            <UInput v-model="apothekerState.firstName" class="w-full" />
          </UFormField>

          <UFormField :label="t('label.last.name')" name="lastName" required>
            <UInput v-model="apothekerState.lastName" class="w-full" />
          </UFormField>

          <UFormField
            :label="t('profiles.field.pharmacyName')"
            name="pharmacyName"
            required
          >
            <UInput v-model="apothekerState.pharmacyName" class="w-full" />
          </UFormField>

          <UFormField
            :label="t('profiles.field.street')"
            name="street"
            required
          >
            <UInput v-model="apothekerState.street" class="w-full" />
          </UFormField>

          <UFormField
            :label="t('profiles.field.houseNumber')"
            name="houseNumber"
            required
          >
            <UInput v-model="apothekerState.houseNumber" class="w-full" />
          </UFormField>

          <UFormField
            :label="t('profiles.field.postalCode')"
            name="postalCode"
            required
          >
            <UInput v-model="apothekerState.postalCode" class="w-full" />
          </UFormField>

          <UFormField :label="t('profiles.field.city')" name="city" required>
            <UInput v-model="apothekerState.city" class="w-full" />
          </UFormField>

          <UFormField
            :label="t('profiles.field.countryCode')"
            name="country"
            required
          >
            <UInput v-model="apothekerState.country" class="w-full" />
          </UFormField>

          <UButton :loading="saving" type="submit" :disabled="!isOnline">
            {{ t('common.save.changes') }}
          </UButton>
        </UForm>

        <UForm
          v-else-if="isBezorger"
          :schema="bezorgerSchema"
          :state="bezorgerState"
          class="space-y-4"
          @submit="onSubmitBezorger"
        >
          <UFormField :label="t('label.first.name')" name="firstName" required>
            <UInput v-model="bezorgerState.firstName" class="w-full" />
          </UFormField>

          <UFormField :label="t('label.last.name')" name="lastName" required>
            <UInput v-model="bezorgerState.lastName" class="w-full" />
          </UFormField>

          <UFormField
            :label="t('profiles.field.displayName')"
            name="displayName"
            required
          >
            <UInput v-model="bezorgerState.displayName" class="w-full" />
          </UFormField>

          <UFormField
            :label="t('profiles.field.vehicleOptional')"
            name="vehicleLabel"
          >
            <UInput v-model="bezorgerState.vehicleLabel" class="w-full" />
          </UFormField>

          <UButton :loading="saving" type="submit" :disabled="!isOnline">
            {{ t('common.save.changes') }}
          </UButton>
        </UForm>

        <UForm
          v-else
          :schema="adminSchema"
          :state="adminState"
          class="space-y-4"
          @submit="onSubmitAdmin"
        >
          <UFormField :label="t('label.first.name')" name="firstName" required>
            <UInput v-model="adminState.firstName" class="w-full" />
          </UFormField>

          <UFormField :label="t('label.last.name')" name="lastName" required>
            <UInput v-model="adminState.lastName" class="w-full" />
          </UFormField>

          <UButton :loading="saving" type="submit" :disabled="!isOnline">
            {{ t('common.save.changes') }}
          </UButton>
        </UForm>
      </template>

      <CommonErrorState
        v-else
        :title="t('profiles.unavailable.title')"
        :description="t('profiles.unavailable.description')"
      />
    </UCard>
  </div>
</template>
