import type { RouteRecordRaw, RouteLocationNormalized, NavigationGuardNext } from "vue-router";
import NProgress from "@/utils/nprogress";
import router from "@/router";
import { usePermissionStore, useUserStore } from "@/store";
import { ROLE_ROOT } from "@/constants";

/**
 * 处理根路径重定向逻辑
 * @param routes 路由列表
 * @returns 重定向配置对象或 null
 */
function handleRootPathRedirect(
  routes: RouteRecordRaw[]
): { name?: string; path?: string; replace: boolean } | null {
  const firstAccessibleRoute = findFirstAccessibleRoute(routes);
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
  if (firstAccessibleRoute.name) {
    return { name: firstAccessibleRoute.name, replace: true };
  } else {
    return { path: firstAccessibleRoute.path, replace: true };
  }
}

/**
 * 查找首个可访问的路由
 * @param routes 路由列表
 * @returns 首个可访问的路由信息，包含路径和名称，如果没有则返回 null
 */
function findFirstAccessibleRoute(
  routes: RouteRecordRaw[]
): { path: string; name?: string } | null {
  // 优先查找非隐藏的路由
  const nonHiddenResult = findFirstRoute(routes, false);
  if (nonHiddenResult) {
    return nonHiddenResult;
  }

  // 兜底：查找隐藏的路由
  const hiddenResult = findFirstRoute(routes, true);
  return hiddenResult;
}

/**
 * 查找路由的辅助函数
 * @param routes 路由列表
 * @param includeHidden 是否包含隐藏路由
 * @param parentPath 父路径，用于构建完整路径
 */
function findFirstRoute(
  routes: RouteRecordRaw[],
  includeHidden: boolean,
  parentPath: string = ""
): { path: string; name?: string } | null {
  for (const route of routes) {
    // 根据 includeHidden 参数决定是否跳过隐藏路由
    if (!includeHidden && route.meta?.hidden) {
      continue;
    }

    // 修复路径构建逻辑
    let currentPath: string;
    if (!parentPath) {
      // 根路径情况
      currentPath = route.path.startsWith("/") ? route.path : `/${route.path}`;
    } else {
      // 子路径情况
      if (route.path.startsWith("/")) {
        // 绝对路径直接使用
        currentPath = route.path;
      } else {
        // 相对路径需要拼接
        currentPath = `${parentPath}/${route.path}`;
      }
    }

    // 清理可能的双斜杠
    currentPath = currentPath.replace(/\/+/g, "/");

    // 如果有子路由，递归查找
    if (route.children && route.children.length > 0) {
      const childRoute = findFirstRoute(route.children, includeHidden, currentPath);
      if (childRoute) {
        return childRoute;
      }
    }

    // 如果是叶子节点且有组件，返回该路由
    if (route.component && route.path !== "/" && route.path !== "") {
      return {
        path: currentPath,
        name: route.name as string,
      };
    }
  }

  return null;
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
          const redirectResult = handleRootPathRedirect(permissionStore.routes);
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
