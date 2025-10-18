import type { RouteRecordRaw } from "vue-router";
import { constantRoutes } from "@/router";
import { store } from "@/store";
import router from "@/router";

import MenuAPI, { type RouteVO } from "@/api/system/menu-api";

/**
 * 路由映射表接口
 * 用于快速查找路由和父级菜单关系
 */
interface RouteMap {
  /** 路径到路由的映射 */
  pathToRoute: Map<string, RouteRecordRaw>;
  /** 路径到父级菜单的映射 */
  pathToParentMenu: Map<string, string>;
  /** 首个可访问路由 */
  firstAccessibleRoute: RouteRecordRaw | null;
  /** 所有可见菜单路径 */
  visibleMenuPaths: Set<string>;
}
const modules = import.meta.glob("../../views/**/**.vue");
const Layout = () => import("../../layouts/index.vue");

/**
 * 构建路由映射表
 * 通过一次遍历构建所有路由的映射关系，实现 O(1) 时间复杂度的查找
 * @param routes 路由列表
 * @returns 路由映射表，包含路径到路由、路径到父级菜单、可见菜单路径等映射
 */
function buildRouteMap(routes: RouteRecordRaw[]): RouteMap {
  const pathToRoute = new Map<string, RouteRecordRaw>();
  const pathToParentMenu = new Map<string, string>();
  const visibleMenuPaths = new Set<string>();
  let firstAccessibleRoute: RouteRecordRaw | null = null;

  /**
   * 构建完整路径
   * @param routePath 路由路径
   * @param parentPath 父路径
   * @returns 完整路径
   */
  function buildFullPath(routePath: string, parentPath: string = ""): string {
    if (!routePath || routePath === "") {
      return parentPath || "/";
    }
    if (!parentPath) {
      return routePath.startsWith("/") ? routePath : `/${routePath}`;
    }

    if (routePath.startsWith("/")) {
      return routePath;
    }

    const fullPath = `${parentPath}/${routePath}`;
    return fullPath.replace(/\/+/g, "/");
  }

  /**
   * 遍历路由树构建映射表
   * @param routes 路由列表
   * @param parentPath 父路径
   * @param parentMenuPath 父菜单路径
   */
  function traverseRouteTree(
    routes: RouteRecordRaw[],
    parentPath: string = "",
    parentMenuPath: string = ""
  ) {
    for (const route of routes) {
      const currentPath = buildFullPath(route.path, parentPath);
      const currentMenuPath = route.meta?.hidden ? parentMenuPath : currentPath;

      // 存储路径到路由的映射
      pathToRoute.set(currentPath, route);

      // 存储路径到父级菜单的映射
      if (parentMenuPath && parentMenuPath !== currentPath) {
        pathToParentMenu.set(currentPath, parentMenuPath);
      }

      // 记录可见菜单路径
      if (!route.meta?.hidden && route.component && route.path !== "/" && route.path !== "") {
        visibleMenuPaths.add(currentPath);
      }

      // 递归处理子路由
      if (route.children && route.children.length > 0) {
        traverseRouteTree(route.children, currentPath, currentMenuPath);
      }
    }
  }

  /**
   * 查找首个可访问的路由（与原来的逻辑完全一致）
   * 优先查找非隐藏的子路由，如果没有则查找隐藏的子路由
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
   * 查找路由的辅助函数（与原来的逻辑完全一致）
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

      // 构建当前路由的完整路径
      const currentPath = buildFullPath(route.path, parentPath);

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

  traverseRouteTree(routes);

  // 使用与原来完全一致的逻辑查找首个可访问路由
  const firstRouteResult = findFirstAccessibleRoute(routes);
  if (firstRouteResult) {
    // 从映射表中获取完整的路由对象
    const route = pathToRoute.get(firstRouteResult.path);
    if (route) {
      firstAccessibleRoute = route;
    }
  }

  return {
    pathToRoute,
    pathToParentMenu,
    firstAccessibleRoute,
    visibleMenuPaths,
  };
}

export const usePermissionStore = defineStore("permission", () => {
  // 所有路由（静态路由 + 动态路由）
  const routes = ref<RouteRecordRaw[]>([]);
  // 混合布局的左侧菜单路由
  const mixLayoutSideMenus = ref<RouteRecordRaw[]>([]);
  // 动态路由是否已生成
  const isRouteGenerated = ref(false);
  // 路由映射表，用于快速查找
  const routeMap = ref<RouteMap>({
    pathToRoute: new Map(),
    pathToParentMenu: new Map(),
    firstAccessibleRoute: null,
    visibleMenuPaths: new Set(),
  });

  /** 生成动态路由 */
  async function generateRoutes(): Promise<RouteRecordRaw[]> {
    try {
      const data = await MenuAPI.getRoutes(); // 获取当前登录人的菜单路由
      const dynamicRoutes = transformRoutes(data);

      routes.value = [...constantRoutes, ...dynamicRoutes];

      // 构建路由映射表
      routeMap.value = buildRouteMap(routes.value);
      isRouteGenerated.value = true;

      return dynamicRoutes;
    } catch (error) {
      // 路由生成失败，重置状态
      isRouteGenerated.value = false;
      throw error;
    }
  }

  /** 设置混合布局左侧菜单 */
  const setMixLayoutSideMenus = (parentPath: string) => {
    const parentMenu = routes.value.find((item) => item.path === parentPath);
    mixLayoutSideMenus.value = parentMenu?.children || [];
  };

  /**
   * 获取首个可访问路由
   * @returns 首个可访问的路由，如果没有则返回 null
   */
  const getFirstAccessibleRoute = (): RouteRecordRaw | null => {
    return routeMap.value.firstAccessibleRoute;
  };

  /**
   * 根据路径获取父级菜单路径
   * @param path 路由路径
   * @returns 父级菜单路径，如果没有则返回 null
   */
  const getParentMenuByPath = (path: string): string | null => {
    return routeMap.value.pathToParentMenu.get(path) || null;
  };

  /**
   * 检查路径是否为可见菜单路径
   * @param path 路由路径
   * @returns 是否为可见菜单路径
   */
  const isVisibleMenuPath = (path: string): boolean => {
    return routeMap.value.visibleMenuPaths.has(path);
  };

  /**
   * 根据路径获取路由对象
   * @param path 路由路径
   * @returns 路由对象，如果没有则返回 undefined
   */
  const getRouteByPath = (path: string): RouteRecordRaw | undefined => {
    return routeMap.value.pathToRoute.get(path);
  };

  /** 重置路由状态 */
  const resetRouter = () => {
    // 移除动态添加的路由
    const constantRouteNames = new Set(constantRoutes.map((route) => route.name).filter(Boolean));
    routes.value.forEach((route) => {
      if (route.name && !constantRouteNames.has(route.name)) {
        router.removeRoute(route.name);
      }
    });

    // 重置所有状态
    routes.value = [...constantRoutes];
    mixLayoutSideMenus.value = [];
    isRouteGenerated.value = false;

    // 重置路由映射表
    routeMap.value = {
      pathToRoute: new Map(),
      pathToParentMenu: new Map(),
      firstAccessibleRoute: null,
      visibleMenuPaths: new Set(),
    };
  };

  return {
    routes,
    mixLayoutSideMenus,
    isRouteGenerated,
    routeMap,
    generateRoutes,
    setMixLayoutSideMenus,
    resetRouter,
    getFirstAccessibleRoute,
    getParentMenuByPath,
    isVisibleMenuPath,
    getRouteByPath,
  };
});

/**
 * 转换后端路由数据为Vue Router配置
 * 处理组件路径映射和Layout层级嵌套
 */
const transformRoutes = (routes: RouteVO[], isTopLevel: boolean = true): RouteRecordRaw[] => {
  return routes.map((route) => {
    const { component, children, ...args } = route;

    // 处理组件：顶层或非Layout保留组件，中间层Layout设为undefined
    const processedComponent = isTopLevel || component !== "Layout" ? component : undefined;

    const normalizedRoute = { ...args } as RouteRecordRaw;

    if (!processedComponent) {
      // 多级菜单的父级菜单，不需要组件
      normalizedRoute.component = undefined;
    } else {
      // 动态导入组件，Layout特殊处理，找不到组件时返回404
      normalizedRoute.component =
        processedComponent === "Layout"
          ? Layout
          : modules[`../../views/${processedComponent}.vue`] ||
            modules[`../../views/error/404.vue`];
    }

    // 解析 meta 中的 params 参数，如果 key 以 meta_ 开头则提升为 meta 参数，并从 params 中删除
    if (normalizedRoute.meta?.params) {
      for (const key of Object.keys(normalizedRoute.meta.params as Record<string, string>)) {
        if (key.startsWith("meta_")) {
          normalizedRoute.meta[key.replace("meta_", "")] =
            normalizedRoute.meta.params[key as keyof typeof normalizedRoute.meta.params];
          delete normalizedRoute.meta.params[key as keyof typeof normalizedRoute.meta.params];
        }
      }
    }

    // 递归处理子路由
    if (children && children.length > 0) {
      normalizedRoute.children = transformRoutes(children, false);
    }

    return normalizedRoute;
  });
};

/** 非组件环境使用权限store */
export function usePermissionStoreHook() {
  return usePermissionStore(store);
}
