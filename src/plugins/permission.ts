import type { RouteRecordRaw, RouteLocationNormalized, NavigationGuardNext } from "vue-router";
import NProgress from "@/utils/nprogress";
import router from "@/router";
import { usePermissionStore, useUserStore } from "@/store";
import { ROLE_ROOT } from "@/constants";

/**
 * 处理根路径重定向逻辑
 * 使用预构建的路由映射表快速获取首个可访问路由，避免递归查找
 * @param permissionStore 权限存储实例
 * @returns 重定向配置对象或 null
 */
function handleRootPathRedirect(
  permissionStore: ReturnType<typeof usePermissionStore>
): { name?: string; path?: string; replace: boolean } | null {
  const firstAccessibleRoute = permissionStore.getFirstAccessibleRoute();
  if (!firstAccessibleRoute) {
    console.warn("未找到可访问的路由");
    return null;
  }
  // 添加防循环检查
  if (firstAccessibleRoute.path === "/" || firstAccessibleRoute.path === "") {
    console.error("检测到重定向循环，目标路径为根路径");
    return null;
  }
  // 优先使用 name 进行导航
  if (firstAccessibleRoute.name && typeof firstAccessibleRoute.name === "string") {
    return { name: firstAccessibleRoute.name, replace: true };
  } else {
    return { path: firstAccessibleRoute.path, replace: true };
  }
}

/**
 * 处理隐藏页面的 from 参数逻辑
 * 使用预构建的父级菜单映射表快速获取父级菜单路径，避免复杂的递归查找
 * @param to 目标路由
 * @param from 来源路由
 * @param permissionStore 权限存储实例
 * @returns 处理后的路由对象，如果无需处理则返回原路由
 */
function handleHiddenPageFrom(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  permissionStore: ReturnType<typeof usePermissionStore>
): RouteLocationNormalized {
  // 如果目标页面不是隐藏页面，直接返回
  if (!to.meta?.hidden) {
    return to;
  }
  // 如果已经有 from 参数，不重复处理
  if (to.query.from) {
    return to;
  }
  // 如果有明确的 activeMenu 配置，不需要自动添加 from
  if (to.meta?.activeMenu) {
    return to;
  }
  // 获取合适的 from 值
  const fromPath = getAutoFromPath(from, permissionStore);
  if (!fromPath) {
    return to;
  }
  // 创建带有 from 参数的新路由
  return {
    ...to,
    query: {
      ...to.query,
      from: fromPath,
    },
  } as RouteLocationNormalized;
}
/**
 * 获取自动设置的 from 路径
 * 使用预构建的父级菜单映射表快速获取父级菜单路径，替代复杂的递归查找
 * @param from 来源路由
 * @param permissionStore 权限存储实例
 * @returns from 路径或 null
 */
function getAutoFromPath(
  from: RouteLocationNormalized,
  permissionStore: ReturnType<typeof usePermissionStore>
): string | null {
  // 来源是登录页或根路径，不设置 from
  if (!from.path || from.path === "/" || from.path === "/login") {
    return null;
  }
  // 如果来源页面也是隐藏页面，则传递其 from 参数
  if (from.meta?.hidden) {
    // 如果来源页面有 from 参数，继续传递
    if (from.query.from && typeof from.query.from === "string") {
      return from.query.from;
    }

    // 如果来源页面有明确的 activeMenu，使用它
    if (from.meta?.activeMenu && typeof from.meta.activeMenu === "string") {
      return from.meta.activeMenu;
    }

    // 使用 PermissionStore 的快速查找方法
    return permissionStore.getParentMenuByPath(from.path);
  }
  // 来源页面是普通可见页面，直接使用其路径
  return from.path;
}

export function setupPermission() {
  const whiteList = ["/login"]; // 无需登录的页面

  router.beforeEach(
    async (
      to: RouteLocationNormalized,
      from: RouteLocationNormalized,
      next: NavigationGuardNext
    ) => {
      NProgress.start();

      try {
        // 使用 store 暴露的登录态，便于后续扩展（如基于过期时间等）
        const isLoggedIn = useUserStore().isLoggedIn();

        // 未登录处理
        if (!isLoggedIn) {
          if (whiteList.includes(to.path)) {
            next();
          } else {
            next(`/login?redirect=${encodeURIComponent(to.fullPath)}`);
            NProgress.done();
          }
          return;
        }

        // 已登录且访问登录页，重定向到首页
        if (to.path === "/login") {
          next({ path: "/" });
          return;
        }

        // 已登录用户的正常访问
        const permissionStore = usePermissionStore();
        const userStore = useUserStore();

        // 路由未生成则生成
        if (!permissionStore.isDynamicRoutesGenerated) {
          if (!userStore.userInfo?.roles?.length) {
            await userStore.getUserInfo();
          }

          const dynamicRoutes = await permissionStore.generateRoutes();
          dynamicRoutes.forEach((route: RouteRecordRaw) => {
            router.addRoute(route);
          });

          // 动态路由生成后，如果当前是根路径或路由匹配失败，需要重新导航
          if (to.path === "/" || to.matched.length === 0) {
            next({ ...to, replace: true });
            return;
          }
        }

        // 在路由守卫中添加防循环逻辑
        if (to.path === "/") {
          const redirectResult = handleRootPathRedirect(permissionStore);
          if (redirectResult) {
            next(redirectResult);
            return;
          }
          // 如果没有找到可访问的路由，重定向到 404
          next({ path: "/404", replace: true });
          return;
        }

        // 检查路由是否存在
        if (to.matched.length === 0) {
          next("/404");
          return;
        }
        // 新增：自动处理隐藏页面的 from 参数逻辑
        const enhancedTo = handleHiddenPageFrom(to, from, permissionStore);
        if (enhancedTo !== to) {
          next(enhancedTo);
          return;
        }
        // 设置页面标题
        const title = (to.params.title as string) || (to.query.title as string);
        if (title) {
          to.meta.title = title;
        }

        next();
      } catch (error) {
        console.error("❌ Route guard error:", error);
        // 出错时清理状态并重定向到登录页
        try {
          await useUserStore().resetAllState();
        } catch (resetError) {
          console.error("❌ Failed to reset user state:", resetError);
        }
        next("/login");
        NProgress.done();
      }
    }
  );

  router.afterEach(() => {
    NProgress.done();
  });
}

/** 判断是否有权限 */
export function hasAuth(value: string | string[], type: "button" | "role" = "button") {
  const { roles, perms } = useUserStore().userInfo;

  // 超级管理员 拥有所有权限
  if (type === "button" && roles.includes(ROLE_ROOT)) {
    return true;
  }

  const auths = type === "button" ? perms : roles;
  return typeof value === "string"
    ? auths.includes(value)
    : value.some((perm) => auths.includes(perm));
}
