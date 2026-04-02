<template>
    <span
        class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
        :class="passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
    >
        {{ passed ? 'PASS' : 'FAIL' }}
    </span>
</template>

<script setup>
defineProps({
    passed: Boolean,
})
</script>
