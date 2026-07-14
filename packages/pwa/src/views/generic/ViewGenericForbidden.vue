<template>
  <div class="mx-auto max-w-lg px-4 py-16">
    <CommonPermissionDenied />
    <div class="mt-6 text-center">
      <UButton to="/auth/login" variant="soft">Naar login</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import CommonPermissionDenied from '@/components/common/CommonPermissionDenied.vue'
</script>
