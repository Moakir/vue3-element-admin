<template>
  <div
    class="error-page-layout w-full min-h-screen flex flex-col items-center justify-center bg-[var(--error-bg)] text-[var(--error-text)] px-4"
  >
    <div
      class="flex flex-col-reverse lg:flex-row justify-between items-center w-full max-w-5xl bg-white/80 dark:bg-dark-800/80 p-6 lg:p-12 gap-0 lg:gap-x-12"
      :class="imgPosition === 'left' ? 'lg:flex-row-reverse' : 'lg:flex-row'"
    >
      <div class="w-auto max-w-md flex flex-col mt-8 lg:mt-0 text-left">
        <div class="text-primary text-3xl font-bold mb-2 animate-fade-in">OOPS！</div>
        <div class="mb-2 text-sm text-gray-500 animate-fade-in">
          {{ desc }}
        </div>
        <div class="mb-2 text-xl font-bold text-[#222] dark:text-white animate-fade-in">
          {{ headline }}
        </div>
        <div class="mb-6 text-sm text-gray-400 animate-fade-in">
          {{ tips }}
        </div>
        <div class="flex gap-4">
          <el-button type="primary" class="rounded-full h-10 w-32 text-base" @click="goHome">
            返回首页
          </el-button>
          <el-button v-if="showBack" class="rounded-full h-10 w-32 text-base" @click="goBack">
            返回上一页
          </el-button>
        </div>
      </div>
      <div class="flex-1 flex items-center justify-center">
        <slot name="image" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  desc: string;
  headline: string;
  tips: string;
  showBack?: boolean;
  imgPosition?: "left" | "right";
}>();

const router = useRouter();
const goHome = () => router.push({ path: "/" });
const goBack = () => router.back();
</script>

<style scoped>
:root {
  --error-bg: #f5f6fa;
  --error-text: #222;
}
html.dark {
  --error-bg: #181a20;
  --error-text: #eee;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in {
  animation: fade-in 0.5s both;
}
</style>
