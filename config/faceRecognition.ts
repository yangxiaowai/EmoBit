/**
 * 人脸识别配置（来自 /public/faces/）
 * 老人端人脸识别与家属端人脸相册共用
 */
export interface FaceRecognitionItem {
    file: string;
    relation: string;
    name: string;
    description: string;
}

export const FACE_RECOGNITION_CONFIG: FaceRecognitionItem[] = [
    { file: '儿子.png', relation: '儿子', name: '张明', description: '这是您的儿子张明。他在北京工作，是工程师，每周六都会来看您。' },
    { file: '老伴.png', relation: '老伴', name: '', description: '张爷爷，这是您的老伴。她陪着您走过了几十年，是您最亲的人。' },
    { file: '儿媳.png', relation: '儿媳', name: '', description: '这是您的大儿媳。她和小明一起住在北京，经常给您带好吃的。' },
    { file: '孙子.png', relation: '孙子', name: '小明', description: '这是您的孙子小明。他今年上高中了，特别喜欢下棋，经常陪您下两盘。' },
    { file: '孙女.png', relation: '孙女', name: '', description: '这是您的小孙女。她活泼可爱，每次来看您都会给您讲学校的趣事。' },
];
