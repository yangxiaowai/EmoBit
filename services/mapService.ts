/**
 * 高德地图导航服务
 * 使用高德地图 JS API 实现路线规划和导航
 * 
 * 注意：当前暂时禁用地图功能（缺少 @amap/amap-jsapi-loader 依赖）
 * 所有方法将返回失败结果，不影响其他功能测试
 */

// 暂时禁用地图导入，避免启动错误
// import AMapLoader from '@amap/amap-jsapi-loader';
const MAP_SERVICE_DISABLED = true; // 设置为 false 以启用地图功能
let AMapLoader: any = null;

// 如果启用地图功能，取消注释上面的 import 并设置 MAP_SERVICE_DISABLED = false

// 类型定义
export interface LngLat {
    lng: number;
    lat: number;
}

export interface RouteStep {
    instruction: string;  // 导航指令，如"向左转"
    road: string;         // 道路名称
    distance: number;     // 该步骤距离(米)
    duration: number;     // 预计时间(秒)
    action: 'left' | 'right' | 'straight' | 'arrive' | 'start';
}

export interface RouteResult {
    success: boolean;
    distance: number;     // 总距离(米)
    duration: number;     // 总时间(秒)
    steps: RouteStep[];
    polyline?: number[][]; // 路线坐标点
    error?: string;
}

export interface GeocodeResult {
    success: boolean;
    location?: LngLat;
    formattedAddress?: string;
    error?: string;
}

// 高德地图AMap类型（简化版）
interface AMapInstance {
    plugin: (plugins: string[], callback: () => void) => void;
    Walking: new (options?: object) => WalkingService;
    Driving: new (options?: object) => DrivingService;
    Geocoder: new () => GeocoderService;
    Geolocation: new (options?: object) => GeolocationService;
}

interface WalkingService {
    search: (
        start: [number, number],
        end: [number, number],
        callback: (status: string, result: any) => void
    ) => void;
}

interface DrivingService {
    search: (
        start: [number, number],
        end: [number, number],
        callback: (status: string, result: any) => void
    ) => void;
}

interface GeocoderService {
    getLocation: (
        address: string,
        callback: (status: string, result: any) => void
    ) => void;
}

interface GeolocationService {
    getCurrentPosition: (
        callback: (status: string, result: any) => void
    ) => void;
}

class MapService {
    private AMap: AMapInstance | null = null;
    private isInitialized = false;

    /**
     * 初始化高德地图SDK
     */
    async init(): Promise<boolean> {
        // 如果地图功能已禁用，直接返回 false
        if (MAP_SERVICE_DISABLED || !AMapLoader) {
            console.warn('[MapService] 地图功能已禁用');
            return false;
        }

        if (this.isInitialized && this.AMap) {
            return true;
        }

        const key = import.meta.env.VITE_AMAP_KEY;
        const securityCode = import.meta.env.VITE_AMAP_SECURITY_CODE;

        if (!key || key === 'your_amap_key_here') {
            console.warn('[MapService] 未配置高德地图API Key');
            return false;
        }

        try {
            // 设置安全密钥
            if (securityCode && securityCode !== 'your_amap_security_code_here') {
                (window as any)._AMapSecurityConfig = {
                    securityJsCode: securityCode,
                };
            }

            this.AMap = await AMapLoader.load({
                key,
                version: '2.0',
                plugins: ['AMap.Walking', 'AMap.Driving', 'AMap.Geocoder', 'AMap.Geolocation'],
            });

            this.isInitialized = true;
            console.log('[MapService] 高德地图SDK初始化成功');
            return true;
        } catch (error) {
            console.error('[MapService] 初始化失败:', error);
            return false;
        }
    }

    /**
     * 地址转坐标（地理编码）
     */
    async geocode(address: string): Promise<GeocodeResult> {
        if (!await this.init()) {
            return { success: false, error: '地图服务未初始化' };
        }

        return new Promise((resolve) => {
            const geocoder = new this.AMap!.Geocoder();

            geocoder.getLocation(address, (status, result) => {
                if (status === 'complete' && result.geocodes?.length > 0) {
                    const geo = result.geocodes[0];
                    resolve({
                        success: true,
                        location: { lng: geo.location.lng, lat: geo.location.lat },
                        formattedAddress: geo.formattedAddress,
                    });
                } else {
                    resolve({ success: false, error: '地址解析失败' });
                }
            });
        });
    }

    /**
     * 获取当前位置
     */
    async getCurrentLocation(): Promise<GeocodeResult> {
        if (!await this.init()) {
            return { success: false, error: '地图服务未初始化' };
        }

        return new Promise((resolve) => {
            const geolocation = new this.AMap!.Geolocation({
                enableHighAccuracy: true,
                timeout: 10000,
            });

            geolocation.getCurrentPosition((status, result) => {
                if (status === 'complete') {
                    resolve({
                        success: true,
                        location: { lng: result.position.lng, lat: result.position.lat },
                        formattedAddress: result.formattedAddress,
                    });
                } else {
                    resolve({ success: false, error: '定位失败' });
                }
            });
        });
    }

    /**
     * 步行路线规划
     */
    async planWalkingRoute(
        start: LngLat | string,
        end: LngLat | string
    ): Promise<RouteResult> {
        if (!await this.init()) {
            return { success: false, distance: 0, duration: 0, steps: [], error: '地图服务未初始化' };
        }

        // 如果是地址字符串，先转换为坐标
        let startLngLat: LngLat;
        let endLngLat: LngLat;

        if (typeof start === 'string') {
            const result = await this.geocode(start);
            if (!result.success || !result.location) {
                return { success: false, distance: 0, duration: 0, steps: [], error: `起点"${start}"解析失败` };
            }
            startLngLat = result.location;
        } else {
            startLngLat = start;
        }

        if (typeof end === 'string') {
            const result = await this.geocode(end);
            if (!result.success || !result.location) {
                return { success: false, distance: 0, duration: 0, steps: [], error: `终点"${end}"解析失败` };
            }
            endLngLat = result.location;
        } else {
            endLngLat = end;
        }

        return new Promise((resolve) => {
            const walking = new this.AMap!.Walking();

            walking.search(
                [startLngLat.lng, startLngLat.lat],
                [endLngLat.lng, endLngLat.lat],
                (status, result) => {
                    if (status === 'complete' && result.routes?.length > 0) {
                        const route = result.routes[0];
                        const steps = this.parseSteps(route.steps || []);

                        resolve({
                            success: true,
                            distance: route.distance || 0,
                            duration: route.time || 0,
                            steps,
                            polyline: route.path?.map((p: any) => [p.lng, p.lat]),
                        });
                    } else {
                        resolve({
                            success: false,
                            distance: 0,
                            duration: 0,
                            steps: [],
                            error: '路线规划失败',
                        });
                    }
                }
            );
        });
    }

    /**
     * 驾车路线规划
     */
    async planDrivingRoute(
        start: LngLat | string,
        end: LngLat | string
    ): Promise<RouteResult> {
        if (!await this.init()) {
            return { success: false, distance: 0, duration: 0, steps: [], error: '地图服务未初始化' };
        }

        // 地址转换逻辑同上
        let startLngLat: LngLat;
        let endLngLat: LngLat;

        if (typeof start === 'string') {
            const result = await this.geocode(start);
            if (!result.success || !result.location) {
                return { success: false, distance: 0, duration: 0, steps: [], error: `起点解析失败` };
            }
            startLngLat = result.location;
        } else {
            startLngLat = start;
        }

        if (typeof end === 'string') {
            const result = await this.geocode(end);
            if (!result.success || !result.location) {
                return { success: false, distance: 0, duration: 0, steps: [], error: `终点解析失败` };
            }
            endLngLat = result.location;
        } else {
            endLngLat = end;
        }

        return new Promise((resolve) => {
            const driving = new this.AMap!.Driving({ policy: 0 }); // 最快路线

            driving.search(
                [startLngLat.lng, startLngLat.lat],
                [endLngLat.lng, endLngLat.lat],
                (status, result) => {
                    if (status === 'complete' && result.routes?.length > 0) {
                        const route = result.routes[0];
                        const steps = this.parseSteps(route.steps || []);

                        resolve({
                            success: true,
                            distance: route.distance || 0,
                            duration: route.time || 0,
                            steps,
                            polyline: route.path?.map((p: any) => [p.lng, p.lat]),
                        });
                    } else {
                        resolve({
                            success: false,
                            distance: 0,
                            duration: 0,
                            steps: [],
                            error: '路线规划失败',
                        });
                    }
                }
            );
        });
    }

    /**
     * 解析路线步骤
     */
    private parseSteps(rawSteps: any[]): RouteStep[] {
        return rawSteps.map((step) => {
            const instruction = step.instruction || '';
            let action: RouteStep['action'] = 'straight';

            if (instruction.includes('左转') || instruction.includes('向左')) {
                action = 'left';
            } else if (instruction.includes('右转') || instruction.includes('向右')) {
                action = 'right';
            } else if (instruction.includes('到达') || instruction.includes('终点')) {
                action = 'arrive';
            } else if (instruction.includes('出发') || instruction.includes('起点')) {
                action = 'start';
            }

            return {
                instruction,
                road: step.road || '',
                distance: step.distance || 0,
                duration: step.time || 0,
                action,
            };
        });
    }

    /**
     * 格式化距离显示
     */
    formatDistance(meters: number): string {
        if (meters < 1000) {
            return `${Math.round(meters)} 米`;
        }
        return `${(meters / 1000).toFixed(1)} 公里`;
    }

    /**
     * 格式化时间显示
     */
    formatDuration(seconds: number): string {
        if (seconds < 60) {
            return `${Math.round(seconds)} 秒`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes} 分钟`;
        }
        const hours = Math.floor(minutes / 60);
        const remainMinutes = minutes % 60;
        return `${hours} 小时 ${remainMinutes} 分钟`;
    }

    /**
     * 创建地图实例
     */
    async createMap(containerId: string, center?: [number, number]): Promise<any> {
        if (!await this.init()) {
            return null;
        }

        // @ts-ignore
        const map = new window.AMap.Map(containerId, {
            zoom: 17,
            center: center,
            viewMode: '3D',
        });

        return map;
    }

    /**
     * 添加标记
     */
    addMarker(map: any, position: [number, number], content?: string, popup?: string): any {
        if (!map || !this.AMap) return null;

        // @ts-ignore
        const marker = new window.AMap.Marker({
            position: position,
            content: content,
            anchor: 'bottom-center',
        });

        if (popup) {
            // @ts-ignore
            marker.setLabel({
                content: `<div style="padding:5px; background:white; border-radius:4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${popup}</div>`,
                direction: 'top'
            });
        }

        map.add(marker);
        return marker;
    }

    /**
     * 添加折线
     */
    addPolyline(map: any, path: [number, number][], style: any = {}): any {
        if (!map || !this.AMap) return null;

        // @ts-ignore
        const polyline = new window.AMap.Polyline({
            path: path,
            strokeColor: style.color || "#3366FF",
            strokeOpacity: style.opacity || 1,
            strokeWeight: style.weight || 5,
            strokeStyle: style.dashArray ? "dashed" : "solid",
            strokeDasharray: style.dashArray ? style.dashArray.split(',').map(Number) : undefined,
            lineJoin: 'round',
            lineCap: 'round',
            zIndex: 50,
        });

        map.add(polyline);
        return polyline;
    }

    /**
     * 添加圆
     */
    addCircle(map: any, center: [number, number], radius: number, style: any = {}): any {
        if (!map || !this.AMap) return null;

        // @ts-ignore
        const circle = new window.AMap.Circle({
            center: center,
            radius: radius,
            strokeColor: style.color || "#3366FF",
            strokeOpacity: style.opacity || 1,
            strokeWeight: style.weight || 1,
            fillColor: style.fillColor || "#1791fc",
            fillOpacity: style.fillOpacity || 0.35,
            strokeStyle: style.dashArray ? "dashed" : "solid",
            strokeDasharray: style.dashArray ? style.dashArray.split(',').map(Number) : undefined,
        });

        map.add(circle);
        return circle;
    }

    /**
     * 清除地图覆盖物
     */
    clearMap(map: any): void {
        if (map) {
            map.clearMap();
        }
    }
}

// 单例导出
export const mapService = new MapService();
