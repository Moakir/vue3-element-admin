<template>
  <ErrorPageLayout
    :desc="errorInfo.desc"
    :headline="errorInfo.headline"
    :tips="errorInfo.tips"
    :show-back="errorInfo.showBack"
    :img-position="errorInfo.imgPosition"
  >
    <template #image>
      <img :src="errorInfo.img" :alt="errorInfo.code" class="w-full max-w-2xl" />
    </template>
  </ErrorPageLayout>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import ErrorPageLayout from "./components/ErrorPageLayout.vue";

import img404 from "@/assets/images/404.svg";
import img401 from "@/assets/images/401.svg";
import imgNoLicense from "@/assets/images/401.svg";

const route = useRoute();

interface ErrorInfo {
  code: string;
  desc: string;
  headline: string;
  tips: string;
  img: string;
  showBack: boolean;
  imgPosition?: "left" | "right";
}

const errorMap: Record<string, ErrorInfo> = {
  "404": {
    code: "404",
    desc: "该页面无法访问。",
    headline: "抱歉，您所访问的页面不存在",
    tips: "请检查地址是否正确…",
    img: img404,
    showBack: true,
    imgPosition: "right",
  },
  "401": {
    code: "401",
    desc: "您没有权限访问该页面。",
    headline: "抱歉，您没有权限访问该页面",
    tips: "请联系管理员获取权限。",
    img: img401,
    showBack: true,
    imgPosition: "right",
  },
  "no-license": {
    code: "no-license",
    desc: "系统未检测到有效 License。",
    headline: "未授权，无法访问系统",
    tips: "请联系管理员获取或更新 License。",
    img: imgNoLicense,
    showBack: false,
    imgPosition: "left",
  },
};

const errorInfo = computed<ErrorInfo>(() => {
  const type = route.params.type as string;
  return errorMap[type] || errorMap["404"];
});
</script>

<style scoped lang="scss">
:root {
  --error-bg: var(--el-bg-color, #fff);
  --error-text: var(--el-text-color-primary, #222);
  --error-desc: var(--el-text-color-secondary, #888);
  --error-btn-gap: 16px;
  --error-img-width: clamp(180px, 30vw, 320px);
}
</style>
