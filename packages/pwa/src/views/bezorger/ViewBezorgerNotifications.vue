<script setup lang="ts">
import FeatureNotificationCentre from '@/components/feature/notifications/FeatureNotificationCentre.vue'
</script>

<template>
  <div class="mx-auto max-w-xl" data-testid="bezorger-notifications">
    <FeatureNotificationCentre
      empty-description-key="bezorger.notifications.empty.description"
    />
  </div>
</template>
