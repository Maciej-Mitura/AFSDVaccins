<template>
  <!--
    Compatibility wrapper: online/offline + update/install UI lives in CommonPwaStatus.
    Kept so existing App.vue imports continue to resolve during the Phase 16 cutover.
  -->
  <CommonPwaStatus />
</template>

<script setup lang="ts">
import CommonPwaStatus from '@/components/common/CommonPwaStatus.vue'
</script>
