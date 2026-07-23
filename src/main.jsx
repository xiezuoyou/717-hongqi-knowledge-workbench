import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  BookOpen,
  Car,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  FileSearch,
  Image,
  LayoutGrid,
  ChevronDown,
  Minus,
  Mic,
  PanelRight,
  Play,
  Plus,
  Sparkles,
  SendHorizontal,
  LoaderCircle,
  RotateCcw,
  BarChart3,
  PencilLine,
  Radar,
  Scissors,
  Settings,
  ShieldCheck,
  Tags,
  Workflow,
} from 'lucide-react';
import SplitText from './SplitText.jsx';
import ParallaxCards from './components/ParallaxCards.jsx';
import './styles.css';

const majorTabs = [
  {
    id: 'ai',
    label: 'AI智库',
    subTabs: [
      { id: 'assistant', label: 'AI智库助手' },
      { id: 'workflow', label: '自由工作流' },
    ],
  },
  {
    id: 'library',
    label: '知识库',
    subTabs: [
      { id: 'seed', label: '717专题种子' },
      { id: 'product', label: '产品参数' },
      { id: 'craft', label: '工艺技术' },
      { id: 'competitor', label: '竞品信息' },
      { id: 'talk', label: '话术要点' },
      { id: 'industry', label: '行业数据' },
      { id: 'policy', label: '政策法规' },
      { id: 'search', label: '信息检索' },
    ],
  },
  {
    id: 'data',
    label: '数据控台',
    subTabs: [
      { id: 'publish', label: '发布回传' },
      { id: 'play', label: '播放数据' },
      { id: 'asset', label: '个人资产' },
    ],
  },
];

const knowledgeCategories = [
  { id: 'seed', label: '717专题种子', note: '活动原始素材、资料底稿、内容线索与 AI 可调用的种子条目', count: '持续入库' },
  { id: 'product', label: '产品参数', note: '全系车型参数、配置、价格、竞品对比', count: '28 条' },
  { id: 'craft', label: '工艺技术', note: '制造工艺、技术亮点、专利与结构说明', count: '16 条' },
  { id: 'competitor', label: '竞品信息', note: '竞品动态、产品对比、市场信息', count: '21 条' },
  { id: 'talk', label: '话术要点', note: 'Q&A、敏感词替代方案、统一表达口径', count: '34 条' },
  { id: 'industry', label: '行业数据', note: '销量趋势、政策影响、市场动态', count: '19 条' },
  { id: 'policy', label: '政策法规', note: '汽车行业政策、补贴政策、合规要求', count: '9 条' },
  { id: 'search', label: '信息检索', note: '按关键词、车型、主题、情绪触点检索', count: '即时' },
  { id: 'note', label: '内容条目', note: '可用于 AI 裂变的静态知识条目', count: '持续更新' },
];

const materialImageUrl = (sourcePath) => `http://127.0.0.1:8790/material-assets?path=${encodeURIComponent(sourcePath)}`;

const seedContentCards = [
  {
    id: 'seed-717-gala-stage',
    label: '717粉丝盛典｜晚会舞台种子',
    note: '围绕 717 粉丝盛典晚会现场整理，可用于检索舞台大屏、灯光氛围、嘉宾互动、粉丝情绪和品牌共创场景。适合后续生成活动回顾、短视频口播、海报文案与传播标题。',
    count: '12 张图片',
    cover: materialImageUrl('素材库/图片/717粉丝盛典/晚会/d0543e88d10f15a86c7d2cbad114dcd1.jpg'),
  },
  {
    id: 'seed-717-opening',
    label: '717粉丝盛典｜开场氛围线索',
    note: '记录活动开场阶段的视觉情绪：红色主视觉、舞台纵深、灯光节奏和观众期待感。后续可作为“盛典开场”“高燃入场”“品牌仪式感”类内容的底稿。',
    count: '6 条线索',
    cover: materialImageUrl('素材库/图片/717粉丝盛典/晚会/16b94651696870c49289e749dc536762.jpg'),
  },
  {
    id: 'seed-717-fans',
    label: '717粉丝盛典｜粉丝互动线索',
    note: '聚焦粉丝签到、互动区、合影墙、应援动作和现场反馈，沉淀能够表现“红旗与用户同行”的真实片段，适合裂变成图文笔记和短视频脚本。',
    count: '9 条线索',
    cover: materialImageUrl('素材库/图片/717粉丝盛典/晚会/1b0b19d91401b50f4495a551b6eaec43.jpg'),
  },
  {
    id: 'seed-717-product',
    label: '717粉丝盛典｜产品露出线索',
    note: '整理活动中车辆、展台、品牌符号和产品亮点的露出位置。后续可帮助 AI 判断哪些图片适合做封面，哪些适合做传播配图。',
    count: '5 条素材',
    cover: materialImageUrl('素材库/图片/717粉丝盛典/晚会/3d1003b23c943df40e4101283ca9d2b1.jpg'),
  },
  {
    id: 'seed-717-copy',
    label: '717粉丝盛典｜传播话术种子',
    note: '预置一批活动传播口径，例如“与用户共赴热爱”“把品牌现场变成粉丝记忆点”“从盛典氛围延展到产品认同”等，可用于标题和口播生成。',
    count: '18 条话术',
    cover: materialImageUrl('素材库/图片/717粉丝盛典/晚会/4d2db532d6636e1dd70e7b2b1f390796.jpg'),
  },
  {
    id: 'seed-717-review',
    label: '717粉丝盛典｜复盘审核种子',
    note: '用于沉淀发布前检查项：画面是否出现关键信息、产品露出是否准确、活动称谓是否统一、图片是否适合公开传播。',
    count: '8 条规则',
    cover: materialImageUrl('素材库/图片/717粉丝盛典/晚会/9f63f255e0d70e305df3244e62a77345.jpg'),
  },
];

const seed717Gallery = [
  { src: materialImageUrl('素材库/图片/717粉丝盛典/晚会/d0543e88d10f15a86c7d2cbad114dcd1.jpg'), label: '晚会主舞台' },
  { src: materialImageUrl('素材库/图片/717粉丝盛典/晚会/16b94651696870c49289e749dc536762.jpg'), label: '开场灯光' },
  { src: materialImageUrl('素材库/图片/717粉丝盛典/晚会/1b0b19d91401b50f4495a551b6eaec43.jpg'), label: '粉丝现场' },
  { src: materialImageUrl('素材库/图片/717粉丝盛典/晚会/3d1003b23c943df40e4101283ca9d2b1.jpg'), label: '品牌露出' },
  { src: materialImageUrl('素材库/图片/717粉丝盛典/晚会/4d2db532d6636e1dd70e7b2b1f390796.jpg'), label: '互动瞬间' },
  { src: materialImageUrl('素材库/图片/717粉丝盛典/晚会/9f63f255e0d70e305df3244e62a77345.jpg'), label: '传播画面' },
];

const dataItems = [
  { label: '发布回传', value: '规划中', hint: '用于承接内容发布后的平台回传记录' },
  { label: '播放数据', value: '规划中', hint: '用于汇总视频播放、互动和传播表现' },
  { label: '个人资产', value: '规划中', hint: '用于管理视频、图片、文案和生成结果' },
  { label: '内容效果', value: '规划中', hint: '用于复盘不同内容方向的真实表现' },
  { label: '账号表现', value: '规划中', hint: '用于对照多账号内容发布效果' },
  { label: '任务状态', value: '规划中', hint: '用于跟踪选题、制作、审核和发布进度' },
];

const topNavSections = {
  product: {
    label: '产品能力',
    items: [
      { icon: LayoutGrid, title: 'AI 总控台', description: '统一承接用户需求、种子裂变和内容生成。' },
      { icon: Radar, title: '知识检索', description: '围绕品牌、车型、话术和行业资料快速找依据。' },
      { icon: Workflow, title: '内容工作流', description: '从需求输入到脚本、文案和素材建议的轻量链路。' },
    ],
    featured: {
      tag: '当前版本',
      title: '红旗知识工作台',
      description: '围绕知识检索、种子内容和素材调用，沉淀可持续扩展的内容工作流。',
    },
  },
  solution: {
    label: '使用场景',
    items: [
      { icon: Sparkles, title: '种子裂变', description: '点开一个种子，让 AI 围绕对象生成表达方向。' },
      { icon: PencilLine, title: '单句精修', description: '把口播、标题和文案调得更自然。' },
      { icon: ShieldCheck, title: '表达校验', description: '结合资料库降低事实和口径风险。' },
    ],
    featured: {
      tag: '推荐',
      title: '先做轻量内容生产',
      description: '保留静态知识库作为底座，AI 负责调用和转化。',
    },
  },
  resource: {
    label: '资源中心',
    items: [
      { icon: BookOpen, title: '品牌资料', description: '品牌历史、车型资料、工艺技术等基础内容。' },
      { icon: FileText, title: '话术要点', description: 'Q&A、敏感词替代方案和统一表达口径。' },
      { icon: BarChart3, title: '数据入口', description: '发布回传、播放数据和个人资产统一归档。' },
    ],
    featured: {
      tag: '预留',
      title: '数据控台后续接入',
      description: '内容发布后的回传和效果复盘先保留入口。',
    },
  },
};

const topNavKeys = Object.keys(topNavSections);

const aiFeatureCards = [
  {
    id: 'search',
    title: '知识库信息搜索',
    lead: '01',
    note: '先把问题问具体，再从静态知识库里找答案。',
    examples: [
      '“我想搜索一下关于红旗HQ9的一些信息”',
      '“请帮我找出红旗EH7的续航和配置要点”',
      '“红旗这款车有哪些适合对外表达的亮点”',
    ],
    tone: 'search',
  },
  {
    id: 'create',
    title: 'AI内容制作',
    lead: '02',
    note: '把知识库里的信息，变成短视频、文案或种子裂变方向。',
    examples: [
      '“围绕红旗新车卖点，写3条短视频开场”',
      '“请把这段资料改成更适合口播的版本”',
      '“基于这款车，先给我几种裂变标题”',
    ],
    tone: 'create',
  },
  {
    id: 'review',
    title: '内容信息审核',
    lead: '03',
    note: '先检查表达是否准确、是否过度、是否适合发布。',
    examples: [
      '“这段话有没有夸大或不准确的地方”',
      '“帮我检查这份文案是否适合公开发布”',
      '“把这段内容改得更稳妥一点”',
    ],
    tone: 'review',
  },
];

const productSeriesFilters = [
  { id: 'new-energy', label: '红旗新能源', disabled: true },
  { id: 'tiangong', label: '天工' },
  { id: 'golden', label: '金葵花' },
];

const productModelFilters = {
  tiangong: [
    { id: 'all', label: '全部天工' },
    { id: 'tiangong05', label: '天工05' },
    { id: 'tiangong06', label: '天工06' },
    { id: 'tiangong08', label: '天工08' },
  ],
  golden: [
    { id: 'all', label: '全部金葵花' },
    { id: 'guoli', label: '国礼' },
    { id: 'guoya', label: '国雅' },
    { id: 'guoyao', label: '国耀' },
    { id: 'guoyue', label: '国悦' },
  ],
  'new-energy': [],
};

const productKnowledgeCards = [
  {
    id: 'tiangong05-seed-overview',
    model: '红旗天工05',
    modelId: 'tiangong05',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工05｜产品传播手册总览',
    summary: '基于天工05标准化传播手册整理，定位为新智国潮豪华纯电轿车。核心资料覆盖司南智驾、灵犀座舱、850km级长续航、900V补能、0.213Cd低风阻、东方智慧美学与竞品攻防，可作为 AI 生成口播、图文和审核的优先底稿。',
    meta: ['传播手册', '纯电轿车', 'AI底稿'],
    status: '新入库',
  },
  {
    id: 'tiangong06-seed-overview',
    model: '红旗天工06',
    modelId: 'tiangong06',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工06｜产品传播手册总览',
    summary: '基于天工06智驾调整版传播手册整理，定位为新智国潮豪华纯电 SUV。资料重点包括家庭 SUV 场景、司南500标准版、惯导三目视觉、全场景泊车、最高780km续航、900V高压补能、智能四驱和豪华舒适座舱。',
    meta: ['传播手册', '纯电SUV', '家庭场景'],
    status: '新入库',
  },
  {
    id: 'tiangong08-seed-overview',
    model: '红旗天工08 / E202',
    modelId: 'tiangong08',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工08｜E202标准化传播资料',
    summary: '基于E202标准化传播手册整理，可作为天工08相关资料底稿。内容重点围绕洞见 SIGHT 战略、天工平台与九章平台、旗舰纯电 SUV、730km级续航、L2.9高阶智能辅助驾驶、平台安全、电驱效率和东方设计语言。',
    meta: ['E202资料', 'SIGHT战略', '平台技术'],
    status: '新入库',
  },
  {
    id: 'h9',
    model: '红旗H9',
    series: 'redflag',
    category: ['sedan'],
    title: '红旗H9｜行政豪华轿车产品要点',
    summary: '适合用于品牌旗舰轿车、商务接待、东方豪华表达等内容场景。资料口径可重点围绕庄重外观、舒适座舱、行政气场与红旗品牌精神展开。',
    meta: ['车型定位', '表达话术', '配置摘要'],
    status: '已整理 18 条',
  },
  {
    id: 'hq9',
    model: '新红旗HQ9',
    series: 'redflag',
    category: ['mpv'],
    title: '新红旗HQ9｜家庭与商务 MPV 场景库',
    summary: '重点覆盖多人出行、商务礼宾、亲子家庭和长途舒适场景。内容生产时可从空间、静谧性、座椅舒适度和仪式感切入。',
    meta: ['场景脚本', '空间卖点', '人群洞察'],
    status: '已整理 22 条',
  },
  {
    id: 'hs7',
    model: '红旗HS7',
    series: 'redflag',
    category: ['suv'],
    title: '红旗HS7｜大五座 SUV 资料卡',
    summary: '用于解释中大型 SUV 的稳重感、通过性和家庭高品质出行。适合和户外、城市通勤、家庭升级类内容结合。',
    meta: ['SUV卖点', '竞品对比', '用户问答'],
    status: '已整理 16 条',
  },
  {
    id: 'h6',
    model: '红旗H6',
    series: 'redflag',
    category: ['sedan'],
    title: '红旗H6｜年轻运动表达方向',
    summary: '偏向年轻化、运动感和日常驾驶体验，可用于短视频标题、口播开场和动态镜头脚本，强调更轻快的红旗表达。',
    meta: ['年轻用户', '运动风格', '短视频切口'],
    status: '已整理 13 条',
  },
  {
    id: 'hs6',
    model: '红旗HS6',
    series: 'redflag',
    category: ['suv', 'new-energy'],
    title: '红旗HS6｜新能源 SUV 关注点',
    summary: '资料可按新能源体验、智能座舱、家庭出行和城市通勤分类。适合承接“既要舒适又要科技感”的用户搜索。',
    meta: ['新能源', '智能化', '家庭出行'],
    status: '待补充参数',
  },
  {
    id: 'h5',
    model: '红旗H5',
    series: 'redflag',
    category: ['sedan'],
    title: '红旗H5｜主流家轿内容素材',
    summary: '面向入门豪华、年轻家庭和首购升级用户。内容可围绕外观辨识度、日常实用性、品牌价值感和购车问答展开。',
    meta: ['主销车型', '购车问答', '日常场景'],
    status: '已整理 25 条',
  },
  {
    id: 'hs5',
    model: '红旗HS5',
    series: 'redflag',
    category: ['suv'],
    title: '红旗HS5｜城市 SUV 高频问题',
    summary: '适合沉淀用户常问的空间、动力、配置、油耗、保养与竞品差异。后续可直接作为 AI 检索和话术审核底稿。',
    meta: ['高频问答', '配置说明', '竞品口径'],
    status: '已整理 29 条',
  },
  {
    id: 'eqm5',
    model: '红旗E-QM5',
    series: 'redflag',
    category: ['sedan', 'new-energy'],
    title: '红旗E-QM5｜纯电出行资料包',
    summary: '适合用于通勤、网约出行、低成本用车和纯电体验相关内容。资料重点可放在续航、空间、补能和用车成本。',
    meta: ['纯电轿车', '用车成本', '续航资料'],
    status: '已整理 14 条',
  },
  {
    id: 'hs3',
    model: '红旗HS3',
    series: 'redflag',
    category: ['suv'],
    title: '红旗HS3｜紧凑 SUV 年轻化内容',
    summary: '面向年轻用户、城市短途和轻家庭场景。适合制作选车建议、同级对比、外观细节和智能配置类内容。',
    meta: ['年轻首购', '同级对比', '城市通勤'],
    status: '已整理 17 条',
  },
  {
    id: 'tiangong05',
    model: '红旗天工05',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工05｜天工序列产品线索',
    summary: '作为天工序列资料入口，用于沉淀产品定位、设计关键词、技术标签和上市传播口径，适合承接系列化内容检索。',
    meta: ['天工序列', '技术标签', '传播口径'],
    status: '持续更新',
  },
  {
    id: 'tiangong06',
    model: '红旗天工06',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工06｜新能源表达索引',
    summary: '用于整理天工序列在智能、电驱、舒适和安全维度的表达。后续可接入参数表、图片素材和竞品对照。',
    meta: ['新能源', '资料索引', 'AI检索'],
    status: '持续更新',
  },
  {
    id: 'eh7',
    model: '红旗EH7',
    series: 'redflag',
    category: ['sedan', 'new-energy'],
    title: '红旗EH7｜纯电轿车卖点与续航话术',
    summary: '内容可以围绕纯电性能、智能体验、长途补能和年轻科技感展开。适合做参数解释、销售问答和社媒种草素材。',
    meta: ['纯电轿车', '续航话术', '智能座舱'],
    status: '已整理 20 条',
  },
  {
    id: 'tiangong08',
    model: '红旗天工08',
    series: 'tiangong',
    category: ['suv', 'new-energy', 'tiangong'],
    title: '红旗天工08｜高端新能源 SUV 资料',
    summary: '适合承载家庭旗舰、智能豪华、舒适长途和新能源技术表达。卡片后续可绑定图片、视频和口播素材。',
    meta: ['高端SUV', '天工序列', '场景表达'],
    status: '持续更新',
  },
  {
    id: 'guoli',
    model: '红旗金葵花国礼',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国礼｜旗舰礼宾表达',
    summary: '偏品牌高度与礼宾场景，适合谨慎、庄重、克制地表达旗舰定位。资料需注意口径稳定，避免夸张宣传。',
    meta: ['金葵花', '旗舰礼宾', '品牌调性'],
    status: '已整理 11 条',
  },
  {
    id: 'guoya',
    model: '红旗金葵花国雅',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国雅｜东方豪华关键词',
    summary: '用于沉淀金葵花系列的东方审美、座舱礼序、工艺细节和高端用户场景。适合做品牌向内容底稿。',
    meta: ['东方豪华', '工艺细节', '高端用户'],
    status: '已整理 10 条',
  },
  {
    id: 'guoyao',
    model: '红旗金葵花国耀',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国耀｜高端出行内容方向',
    summary: '资料可围绕尊享出行、空间舒适、旗舰气场和高端审美组织。后续适合接入视频素材和静态海报参考。',
    meta: ['尊享出行', '海报参考', '高端表达'],
    status: '待补充素材',
  },
  {
    id: 'guoyue',
    model: '红旗金葵花国悦',
    series: 'golden',
    category: ['golden', 'mpv'],
    title: '红旗金葵花国悦｜礼宾 MPV 场景',
    summary: '适合把高端 MPV 的空间、礼序和乘坐体验整理成标准话术。内容应更偏正式、稳定和可信。',
    meta: ['礼宾MPV', '乘坐体验', '标准话术'],
    status: '待补充参数',
  },
  {
    id: 'tiangong05-design',
    model: '红旗天工05',
    modelId: 'tiangong05',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工05｜外观设计关键词',
    summary: '用于整理车头比例、灯组识别、车身姿态和新能源视觉符号。适合给 AI 检索“外观怎么讲”“适合拍哪些角度”这类问题做底层资料。',
    meta: ['外观设计', '镜头建议', '视觉识别'],
    status: '已整理 9 条',
  },
  {
    id: 'tiangong05-user',
    model: '红旗天工05',
    modelId: 'tiangong05',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工05｜年轻家庭用户画像',
    summary: '覆盖城市通勤、周末近郊、轻家庭出行和智能配置敏感人群。内容表达可以从“好开、好停、好看、好用”几个方向展开。',
    meta: ['用户画像', '城市通勤', '家庭场景'],
    status: '已整理 12 条',
  },
  {
    id: 'tiangong05-review',
    model: '红旗天工05',
    modelId: 'tiangong05',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工05｜发布前审核口径',
    summary: '收录新能源参数、辅助驾驶、续航表达和价格权益相关的谨慎表述。用于提醒创作者避免绝对化、未经确认或过度承诺的内容。',
    meta: ['内容审核', '风险表达', '合规口径'],
    status: '待校对 6 条',
  },
  {
    id: 'tiangong06-config',
    model: '红旗天工06',
    modelId: 'tiangong06',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工06｜配置摘要与问答',
    summary: '把用户高频关心的智能座舱、舒适配置、安全配置和补能体验做成问答条目，方便后续在 AI 对话里快速召回。',
    meta: ['配置摘要', '高频问答', '资料召回'],
    status: '已整理 15 条',
  },
  {
    id: 'tiangong06-video',
    model: '红旗天工06',
    modelId: 'tiangong06',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工06｜短视频脚本切口',
    summary: '围绕“第一次看车”“家庭试乘”“新能源用车成本”“智能座舱体验”等主题，沉淀可直接裂变成标题和口播的内容线索。',
    meta: ['短视频', '标题裂变', '口播脚本'],
    status: '已整理 18 条',
  },
  {
    id: 'tiangong06-compare',
    model: '红旗天工06',
    modelId: 'tiangong06',
    series: 'tiangong',
    category: ['new-energy', 'tiangong'],
    title: '红旗天工06｜同级竞品对照',
    summary: '记录同级新能源车型在空间、智能、舒适和品牌信任上的对照维度，后续可与正式参数表联动补齐。',
    meta: ['竞品信息', '对比维度', '参数表'],
    status: '框架已建',
  },
  {
    id: 'tiangong08-family',
    model: '红旗天工08',
    modelId: 'tiangong08',
    series: 'tiangong',
    category: ['suv', 'new-energy', 'tiangong'],
    title: '红旗天工08｜家庭旗舰场景',
    summary: '适合沉淀大空间、长途舒适、亲子出行、露营郊游和家庭成员乘坐体验。用于把车型资料转化成生活化内容。',
    meta: ['家庭旗舰', '长途出行', '生活场景'],
    status: '已整理 14 条',
  },
  {
    id: 'tiangong08-tech',
    model: '红旗天工08',
    modelId: 'tiangong08',
    series: 'tiangong',
    category: ['suv', 'new-energy', 'tiangong'],
    title: '红旗天工08｜智能科技表达',
    summary: '集中放置智能座舱、交互体验、电驱平台和安全辅助相关的表达模板。适合 AI 在生成内容时选择更科技、更克制的语言。',
    meta: ['智能科技', '电驱平台', '表达模板'],
    status: '持续更新',
  },
  {
    id: 'tiangong08-material',
    model: '红旗天工08',
    modelId: 'tiangong08',
    series: 'tiangong',
    category: ['suv', 'new-energy', 'tiangong'],
    title: '红旗天工08｜图片与视频素材索引',
    summary: '用于绑定外观、内饰、动态行驶、座舱细节和家庭场景素材。后续搜索素材时，可根据车型、部位、场景和画面氛围快速筛选。',
    meta: ['素材索引', '图片标签', '视频片段'],
    status: '待绑定素材',
  },
  {
    id: 'guoli-history',
    model: '红旗金葵花国礼',
    modelId: 'guoli',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国礼｜品牌礼宾背景',
    summary: '沉淀旗舰礼宾产品与红旗品牌精神之间的关系，适合用于品牌片、活动开场和高端传播内容的背景资料。',
    meta: ['品牌背景', '礼宾场景', '活动表达'],
    status: '已整理 8 条',
  },
  {
    id: 'guoli-detail',
    model: '红旗金葵花国礼',
    modelId: 'guoli',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国礼｜工艺细节索引',
    summary: '按车标、格栅、车身线条、座舱材质和礼序细节拆分资料，便于后续素材识别和 AI 生成画面提示词。',
    meta: ['工艺细节', '车标特写', '画面提示'],
    status: '已整理 13 条',
  },
  {
    id: 'guoya-tone',
    model: '红旗金葵花国雅',
    modelId: 'guoya',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国雅｜文案语气库',
    summary: '强调含蓄、庄重、东方审美和高级感，避免过分热闹的营销语。适合给 AI 做标题、口播和海报文案的风格约束。',
    meta: ['文案风格', '东方审美', '语气约束'],
    status: '已整理 16 条',
  },
  {
    id: 'guoya-scene',
    model: '红旗金葵花国雅',
    modelId: 'guoya',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国雅｜高端用户场景',
    summary: '围绕商务会客、城市礼宾、私享出行和正式场合建立内容场景，帮助创作者把产品气质落到具体画面里。',
    meta: ['高端用户', '商务会客', '场景脚本'],
    status: '已整理 12 条',
  },
  {
    id: 'guoyao-poster',
    model: '红旗金葵花国耀',
    modelId: 'guoyao',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国耀｜海报视觉方向',
    summary: '记录产品图、礼宾场景、暗色背景、金属质感和文字排版的参考方向。后续可用于生成静态封面和活动KV。',
    meta: ['海报参考', '封面设计', 'KV方向'],
    status: '待绑定参考图',
  },
  {
    id: 'guoyao-script',
    model: '红旗金葵花国耀',
    modelId: 'guoyao',
    series: 'golden',
    category: ['golden'],
    title: '红旗金葵花国耀｜高端短片脚本',
    summary: '用于拆解开场镜头、仪式感镜头、座舱细节和收束文案。适合从静态产品资料延展到视频脚本。',
    meta: ['短片脚本', '镜头结构', '收束文案'],
    status: '已整理 7 条',
  },
  {
    id: 'guoyue-seat',
    model: '红旗金葵花国悦',
    modelId: 'guoyue',
    series: 'golden',
    category: ['golden', 'mpv'],
    title: '红旗金葵花国悦｜座舱与乘坐体验',
    summary: '重点沉淀第二排、空间礼序、静谧舒适和多人出行体验。适合商务接待、家庭高端出行和礼宾 MPV 内容。',
    meta: ['座舱体验', '第二排', '静谧舒适'],
    status: '已整理 10 条',
  },
  {
    id: 'guoyue-faq',
    model: '红旗金葵花国悦',
    modelId: 'guoyue',
    series: 'golden',
    category: ['golden', 'mpv'],
    title: '红旗金葵花国悦｜用户问答资料',
    summary: '整理空间、乘坐、礼宾属性、配置和适用人群等问题，后续可作为 AI 检索时的标准问答素材。',
    meta: ['用户问答', '适用人群', '标准资料'],
    status: '框架已建',
  },
];

const tiangong05Gallery = [
  { src: '/assets/tiangong05-demo/tiangong05-10.jpg', label: '整车侧后姿态' },
  { src: '/assets/tiangong05-demo/tiangong05-11.jpg', label: '前灯细节' },
  { src: '/assets/tiangong05-demo/tiangong05-17.jpg', label: '环抱式座舱' },
  { src: '/assets/tiangong05-demo/tiangong05-18.jpg', label: '舒享座椅' },
  { src: '/assets/tiangong05-demo/tiangong05-23.jpg', label: 'AR-HUD展示' },
  { src: '/assets/tiangong05-demo/tiangong05-9.jpg', label: '车身侧面' },
];

function Tiangong05DetailPanel({ onBack }) {
  const galleryLoop = [...tiangong05Gallery, ...tiangong05Gallery];
  const originalDocPath = '素材库/种子内容/seed-007-红旗天工产品传播资料/原始资料/红旗天工05产品传播手册完整版-5-22.docx';

  return (
    <article className="product-detail-panel">
      <header className="product-detail-header">
        <div className="product-card-kicker">
          <span><Car size={15} /></span>
          <b>红旗天工05</b>
        </div>
        <div className="product-detail-actions">
          <a
            href={`http://127.0.0.1:8790/seed-assets?path=${encodeURIComponent(originalDocPath)}`}
            download
          >
            <Download size={15} />
            下载原文档
          </a>
          <button type="button" onClick={onBack}>
            <RotateCcw size={15} />
            返回列表
          </button>
        </div>
      </header>

      <section className="product-detail-hero">
        <p>产品传播手册总览</p>
        <h2>新智国潮豪华纯电轿车</h2>
        <span>
          基于红旗天工05标准化传播手册整理，适合作为产品资料检索、短视频口播、图文种草和发布前事实审核的核心底稿。
        </span>
      </section>

      <section className="product-detail-body">
        <div className="product-detail-copy">
          <h3>资料解读</h3>
          <p>
            天工05的资料主线不是单纯堆配置，而是把“新智生产力”落到用户能感知的纯电出行体验里：司南智驾解决城市、高速、泊车的驾驶压力；灵犀座舱用 DeepSeek、语音、AR-HUD 和场景模式强化智能陪伴；900V补能、850km级续航、0.213Cd低风阻共同回应续航与能耗焦虑。
          </p>
        </div>

        <div className="product-detail-points">
          {[
            ['司南智驾', '惯导三目视觉、城市领航、高速领航、全场景泊车，统一讲成“全国放心开，越开越好开”。'],
            ['灵犀座舱', 'DeepSeek融合、大模型语音、65寸双焦面AR-HUD、场景模式，适合做体验型内容。'],
            ['续航补能', '最高850km CLTC续航，900V版本10%-80%约12min，适合回应通勤、长途和低温焦虑。'],
            ['传播口径', '适合强调“纯电轿车、年轻科技、东方美学、红旗品质”，辅助驾驶相关表达需保持谨慎。'],
          ].map(([title, text]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="product-detail-signal">
        <h3>传播关键信息</h3>
        <div>
          {['4820x1915x1480mm', '轴距2900mm', 'CLTC最高850km', '900V高压补能', '0.213Cd低风阻', '前双叉臂+后五连杆', 'DeepSeek智能座舱', '竞品：Model 3 / P7+ / 海豹EV / 极氪007'].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="product-detail-gallery" aria-label="天工05图片轮播">
        <div className="product-detail-gallery-track">
          {galleryLoop.map((item, index) => (
            <figure key={`${item.src}-${index}`}>
              <img src={item.src} alt={item.label} />
              <figcaption>{item.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

    </article>
  );
}

function ProductKnowledgeLayout() {
  const [activeSeries, setActiveSeries] = useState('tiangong');
  const [activeModel, setActiveModel] = useState('all');
  const [expandedProduct, setExpandedProduct] = useState(null);
  const modelFilters = productModelFilters[activeSeries] || [];
  const visibleCards = productKnowledgeCards.filter((card) => (
    card.series === activeSeries && (activeModel === 'all' || (card.modelId || card.id) === activeModel)
  ));

  const switchSeries = (filter) => {
    if (filter.disabled) return;
    setActiveSeries(filter.id);
    setActiveModel('all');
    setExpandedProduct(null);
  };

  return (
    <section className="product-knowledge">
      <div className={`product-filter-stack ${expandedProduct ? 'is-muted' : ''}`} aria-label="产品信息筛选">
        <div className="product-filter-bar is-primary">
          {productSeriesFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`${filter.id === activeSeries ? 'active' : ''} ${filter.disabled ? 'disabled' : ''}`}
              onClick={() => switchSeries(filter)}
              disabled={filter.disabled}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {modelFilters.length > 0 && (
          <div className="product-filter-bar is-secondary">
            {modelFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={filter.id === activeModel ? 'active' : ''}
                onClick={() => {
                  setActiveModel(filter.id);
                  setExpandedProduct(null);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {expandedProduct === 'tiangong05' ? (
        <Tiangong05DetailPanel onBack={() => setExpandedProduct(null)} />
      ) : visibleCards.length > 0 ? (
        <div className="product-masonry">
          {visibleCards.map((card, index) => (
            <article key={card.id} className="product-knowledge-card" style={{ '--card-delay': `${index * 34}ms` }}>
              <div className="product-card-kicker">
                <span><Car size={15} /></span>
                <b>{card.model}</b>
              </div>
              <h3>{card.title}</h3>
              <p>{card.summary}</p>
              <div className="product-card-tags">
                {card.meta.map((tag) => (
                  <span key={tag}>
                    <Tags size={12} />
                    {tag}
                  </span>
                ))}
              </div>
              <div className="product-card-foot">
                <span>{card.status}</span>
                <button
                  type="button"
                  onClick={() => {
                    if ((card.modelId || card.id) === 'tiangong05') {
                      setExpandedProduct('tiangong05');
                    }
                  }}
                >
                  查看资料
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="product-empty-state">
          <p>这个分类暂时还没有接入车型资料。</p>
        </div>
      )}
    </section>
  );
}

function Seed717DetailPanel({ onBack }) {
  const galleryLoop = [...seed717Gallery, ...seed717Gallery];

  return (
    <article className="product-detail-panel seed-detail-panel">
      <header className="product-detail-header">
        <div className="product-card-kicker">
          <span><BookOpen size={15} /></span>
          <b>717粉丝盛典</b>
        </div>
        <div className="product-detail-actions">
          <button type="button" onClick={onBack}>
            <RotateCcw size={15} />
            返回列表
          </button>
        </div>
      </header>

      <section className="product-detail-hero">
        <p>种子内容分析</p>
        <h2>717粉丝盛典｜晚会舞台种子</h2>
        <span>
          这组素材适合作为活动传播的第一批内容底稿，重点承接舞台氛围、粉丝情绪、品牌共创和盛典记忆点，后续可被 AI 用来生成短视频脚本、图文标题、复盘摘要与素材检索依据。
        </span>
      </section>

      <section className="product-detail-body">
        <div className="product-detail-copy">
          <h3>内容方向</h3>
          <p>
            这组种子不适合只当“晚会照片”使用，更适合拆成三条传播主线：第一条是盛典现场的仪式感，用舞台、大屏、灯光和开场节奏建立品牌声量；第二条是粉丝与品牌的双向奔赴，用互动、欢呼、合影和情绪瞬间建立真实感；第三条是产品与品牌符号的自然露出，把红旗的产品气质放进活动记忆里。
          </p>
        </div>

        <div className="product-detail-points">
          {[
            ['舞台氛围', '适合做开场镜头、封面背景和活动回顾主视觉，关键词可标注为“晚会、舞台、灯光、盛典、开场”。'],
            ['粉丝情绪', '重点捕捉观众、互动、应援和现场热度，用来支撑“用户共创”“热爱同行”类表达。'],
            ['品牌信息', '保留红旗、717粉丝盛典、产品露出、主视觉元素等识别信息，便于后续检索和审核。'],
            ['内容风险', '发布前需要检查人物肖像、现场屏幕文字、品牌称谓和车型露出是否准确，避免误读活动主题。'],
          ].map(([title, text]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="product-detail-signal">
        <h3>关键信息</h3>
        <div>
          {['717粉丝盛典', '晚会现场', '舞台大屏', '灯光氛围', '粉丝互动', '品牌共创', '活动回顾', '短视频脚本', '图文标题', '发布审核'].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="product-detail-ai-advice seed-script-section">
        <p>脚本拆解</p>
        <h3>可以把这组素材拆成三个短视频结构。</h3>
        <div className="product-detail-script-list">
          {[
            {
              title: '结构一｜高燃开场',
              text: '从舞台灯光和大屏画面切入，用一句“717粉丝盛典现场，把红旗和热爱放在同一个舞台上”建立情绪，再接现场人群、主视觉和品牌露出的快速蒙太奇。',
            },
            {
              title: '结构二｜粉丝同行',
              text: '先给观众和互动镜头，再落到“这不是一次单向发布，而是品牌和用户一起完成的盛典”。适合做更温暖、更真实的活动回顾。',
            },
            {
              title: '结构三｜品牌记忆',
              text: '以红旗符号、舞台主视觉和产品露出为线索，把现场素材整理成“看见热爱、看见用户、看见红旗下一步”的传播短片。',
            },
          ].map((script) => (
            <article key={script.title}>
              <strong>{script.title}</strong>
              <p>{script.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="product-detail-gallery" aria-label="717粉丝盛典图片轮播">
        <div className="product-detail-gallery-track">
          {galleryLoop.map((item, index) => (
            <figure key={`${item.src}-${index}`}>
              <img src={item.src} alt={item.label} />
              <figcaption>{item.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

    </article>
  );
}

function SeedContentLayout() {
  const [expandedSeed, setExpandedSeed] = useState(null);

  if (expandedSeed === 'seed-717-gala-stage') {
    return (
      <section className="product-knowledge seed-knowledge">
        <Seed717DetailPanel onBack={() => setExpandedSeed(null)} />
      </section>
    );
  }

  return (
    <section className="product-knowledge seed-knowledge">
      <div className="product-masonry">
        {seedContentCards.map((card, index) => (
          <article key={card.id} className={`product-knowledge-card seed-knowledge-card ${card.cover ? 'has-seed-cover' : ''}`} style={{ '--card-delay': `${index * 34}ms` }}>
            {card.cover && (
              <div className="seed-card-cover">
                <img src={card.cover} alt="" />
              </div>
            )}
            <div className="product-card-kicker">
              <span><BookOpen size={15} /></span>
              <b>717粉丝盛典</b>
            </div>
            <h3>{card.label}</h3>
            <p>{card.note}</p>
            <div className="product-card-tags">
              {['种子内容', '可检索', '待沉淀'].map((tag) => (
                <span key={tag}>
                  <Tags size={12} />
                  {tag}
                </span>
              ))}
            </div>
            <div className="product-card-foot">
              <span>{card.count}</span>
              <button
                type="button"
                onClick={() => {
                  if (card.id === 'seed-717-gala-stage') {
                    setExpandedSeed(card.id);
                  }
                }}
              >
                查看种子
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const workflowNodeTypes = [
  {
    type: 'input',
    label: '需求输入',
    icon: PencilLine,
    accent: '#2563eb',
    description: '收集主题、账号风格、目标时长和参考种子。',
  },
  {
    type: 'script',
    label: '脚本生成',
    icon: FileText,
    accent: '#7c3aed',
    description: '生成口播脚本，并按句号和视觉主体拆节奏段。',
  },
  {
    type: 'tts',
    label: 'MIMO TTS',
    icon: Mic,
    accent: '#0891b2',
    description: '用语音时长反推节奏段时间轴。',
  },
  {
    type: 'caption',
    label: '字幕对齐',
    icon: PanelRight,
    accent: '#0f766e',
    description: '生成纯字字幕，绑定到每个口播段。',
  },
  {
    type: 'asset',
    label: '素材匹配',
    icon: Image,
    accent: '#b45309',
    description: '用素材描述文件反向核对脚本可呈现性。',
  },
  {
    type: 'edit',
    label: 'Remotion 剪辑',
    icon: Scissors,
    accent: '#be123c',
    description: '按时间轴放素材、转场、字幕、BGM。',
  },
  {
    type: 'review',
    label: '审核导出',
    icon: CheckCircle2,
    accent: '#15803d',
    description: '检查口径、比例、音频完整性并导出结果。',
  },
];

const initialWorkflowNodes = [
  {
    id: 'brief',
    type: 'input',
    title: '内容需求',
    x: 80,
    y: 180,
    status: 'ready',
    body: '输入主题、账号目标、成片比例、种子视频和素材包路径。',
    output: 'brief.json',
  },
  {
    id: 'seed',
    type: 'asset',
    title: '种子内容拆解',
    x: 380,
    y: 70,
    status: 'ready',
    body: '分析种子时长、文案结构、画面风格、转场和字幕样式。',
    output: 'seed-analysis.md',
  },
  {
    id: 'script',
    type: 'script',
    title: '脚本与节奏段',
    x: 380,
    y: 290,
    status: 'running',
    body: '先放开写脚本，再按句号、主谓宾和视觉主体合并/拆分。',
    output: 'timelineBeats[]',
  },
  {
    id: 'tts',
    type: 'tts',
    title: 'MIMO 口播生成',
    x: 720,
    y: 250,
    status: 'draft',
    body: '测试 MIMO TTS 音色、语速、断句和 717 读法。',
    output: 'voiceClips[]',
  },
  {
    id: 'caption',
    type: 'caption',
    title: '字幕包',
    x: 1060,
    y: 140,
    status: 'draft',
    body: '纯白字幕，按语音段显示，保留关键词强调开关。',
    output: 'captions.json',
  },
  {
    id: 'match',
    type: 'asset',
    title: '素材反向核对',
    x: 1060,
    y: 360,
    status: 'ready',
    body: '核对素材库是否支撑脚本，删除无法呈现的具体描述。',
    output: 'materialClips[]',
  },
  {
    id: 'remotion',
    type: 'edit',
    title: 'Remotion 合成',
    x: 1410,
    y: 250,
    status: 'ready',
    body: '按 voiceClips 驱动画面时长，加入柔和转场、BGM 和画幅规则。',
    output: 'composition.mp4',
  },
  {
    id: 'review',
    type: 'review',
    title: '发布前检查',
    x: 1760,
    y: 250,
    status: 'blocked',
    body: '检查事实口径、音画同步、BGM 时长、字幕遮挡和输出比例。',
    output: 'review-report.md',
  },
];

const initialWorkflowEdges = [
  ['brief', 'seed'],
  ['brief', 'script'],
  ['seed', 'script'],
  ['script', 'tts'],
  ['tts', 'caption'],
  ['tts', 'match'],
  ['caption', 'remotion'],
  ['match', 'remotion'],
  ['remotion', 'review'],
].map(([from, to]) => ({ id: `${from}-${to}`, from, to }));

const statusLabels = {
  ready: '已配置',
  running: '执行中',
  draft: '待测试',
  blocked: '待审核',
};

function WorkflowCanvasLayout() {
  const [nodes, setNodes] = useState(initialWorkflowNodes);
  const [selectedNodeId, setSelectedNodeId] = useState('script');
  const [viewport, setViewport] = useState({ x: -38, y: 8, zoom: 0.74 });
  const [dragState, setDragState] = useState(null);
  const canvasRef = useRef(null);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[0];
  const nodeTypeMap = useMemo(() => Object.fromEntries(workflowNodeTypes.map((item) => [item.type, item])), []);

  const updateSelectedNode = (patch) => {
    setNodes((items) => items.map((item) => (item.id === selectedNodeId ? { ...item, ...patch } : item)));
  };

  const addNode = (type) => {
    const definition = nodeTypeMap[type];
    const nextId = `${type}-${Date.now().toString(36)}`;
    const offset = nodes.length * 24;
    const nextNode = {
      id: nextId,
      type,
      title: definition.label,
      x: 460 + offset,
      y: 180 + offset,
      status: 'draft',
      body: definition.description,
      output: `${type}.json`,
    };
    setNodes((items) => [...items, nextNode]);
    setSelectedNodeId(nextId);
  };

  const beginNodeDrag = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setDragState({
      mode: 'node',
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: node.x,
      originY: node.y,
    });
  };

  const beginPan = (event) => {
    if (event.button !== 0 || event.target.closest('.workflow-node')) return;
    setDragState({
      mode: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    });
  };

  const handlePointerMove = (event) => {
    if (!dragState) return;
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    if (dragState.mode === 'node') {
      setNodes((items) => items.map((item) => (
        item.id === dragState.nodeId
          ? {
            ...item,
            x: Math.round(dragState.originX + deltaX / viewport.zoom),
            y: Math.round(dragState.originY + deltaY / viewport.zoom),
          }
          : item
      )));
    } else {
      setViewport((current) => ({
        ...current,
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY,
      }));
    }
  };

  const handleWheel = (event) => {
    if (!event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    const nextZoom = Math.min(1.35, Math.max(0.46, viewport.zoom - event.deltaY * 0.0012));
    setViewport((current) => ({ ...current, zoom: Number(nextZoom.toFixed(2)) }));
  };

  const resetViewport = () => setViewport({ x: -38, y: 8, zoom: 0.74 });
  const orderedNodes = ['brief', 'seed', 'script', 'tts', 'caption', 'match', 'remotion', 'review']
    .map((id) => nodes.find((node) => node.id === id))
    .filter(Boolean);

  return (
    <section className="workflow-studio">
      <aside className="workflow-sidebar">
        <div className="workflow-sidebar-head">
          <span><Workflow size={16} /></span>
          <div>
            <strong>节点库</strong>
            <p>拖动节点，点击编辑配置。</p>
          </div>
        </div>
        <div className="workflow-node-palette">
          {workflowNodeTypes.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.type} type="button" onClick={() => addNode(item.type)}>
                <span style={{ color: item.accent }}><Icon size={17} /></span>
                <b>{item.label}</b>
                <Plus size={14} />
              </button>
            );
          })}
        </div>
      </aside>

      <div className="workflow-canvas-wrap">
        <div className="workflow-toolbar">
          <div>
            <strong>717 内容裂变自由画布</strong>
            <span>脚本、TTS、字幕、素材匹配和 Remotion 合成可以拆成可编排节点。</span>
          </div>
          <div className="workflow-toolbar-actions">
            <button type="button" onClick={() => setViewport((item) => ({ ...item, zoom: Math.max(0.46, Number((item.zoom - 0.08).toFixed(2))) }))} aria-label="缩小">
              <Minus size={16} />
            </button>
            <button type="button" onClick={resetViewport}>适配</button>
            <button type="button" onClick={() => setViewport((item) => ({ ...item, zoom: Math.min(1.35, Number((item.zoom + 0.08).toFixed(2))) }))} aria-label="放大">
              <Plus size={16} />
            </button>
            <button type="button" className="is-run">
              <Play size={15} />
              试运行
            </button>
          </div>
        </div>

        <div
          className="workflow-canvas"
          ref={canvasRef}
          onPointerDown={beginPan}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragState(null)}
          onPointerLeave={() => setDragState(null)}
          onWheel={handleWheel}
        >
          <div className="workflow-grid" />
          <svg
            className="workflow-edges"
            style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
            width="2400"
            height="900"
            viewBox="0 0 2400 900"
          >
            <defs>
              <marker id="workflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
            </defs>
            {initialWorkflowEdges.map((edge) => {
              const from = nodes.find((node) => node.id === edge.from);
              const to = nodes.find((node) => node.id === edge.to);
              if (!from || !to) return null;
              const startX = from.x + 260;
              const startY = from.y + 64;
              const endX = to.x;
              const endY = to.y + 64;
              const curve = Math.max(80, Math.abs(endX - startX) * 0.42);
              return (
                <path
                  key={edge.id}
                  d={`M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  markerEnd="url(#workflow-arrow)"
                />
              );
            })}
          </svg>

          <div
            className="workflow-world"
            style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
          >
            {nodes.map((node) => {
              const definition = nodeTypeMap[node.type] || workflowNodeTypes[0];
              const Icon = definition.icon;
              return (
                <article
                  key={node.id}
                  className={`workflow-node ${node.id === selectedNodeId ? 'is-selected' : ''} is-${node.status}`}
                  style={{ left: node.x, top: node.y, '--node-accent': definition.accent }}
                  onPointerDown={(event) => beginNodeDrag(event, node)}
                >
                  <header>
                    <span><Icon size={18} /></span>
                    <div>
                      <strong>{node.title}</strong>
                      <p>{definition.label}</p>
                    </div>
                    <b>{statusLabels[node.status]}</b>
                  </header>
                  <p>{node.body}</p>
                  <footer>
                    <i><Circle size={8} fill="currentColor" /> input</i>
                    <em>{node.output}</em>
                    <i>output <Circle size={8} fill="currentColor" /></i>
                  </footer>
                </article>
              );
            })}
          </div>
        </div>

        <div className="workflow-run-strip">
          {orderedNodes.map((node, index) => (
            <React.Fragment key={node.id}>
              <span className={`is-${node.status}`}>{node.title}</span>
              {index < orderedNodes.length - 1 && <ArrowRight size={13} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <aside className="workflow-inspector">
        <div className="workflow-inspector-head">
          <span><Settings size={16} /></span>
          <div>
            <strong>节点配置</strong>
            <p>{selectedNode?.id}</p>
          </div>
        </div>

        {selectedNode && (
          <div className="workflow-form">
            <label>
              节点名称
              <input value={selectedNode.title} onChange={(event) => updateSelectedNode({ title: event.target.value })} />
            </label>
            <label>
              状态
              <select value={selectedNode.status} onChange={(event) => updateSelectedNode({ status: event.target.value })}>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              说明
              <textarea value={selectedNode.body} onChange={(event) => updateSelectedNode({ body: event.target.value })} rows="5" />
            </label>
            <label>
              输出
              <input value={selectedNode.output} onChange={(event) => updateSelectedNode({ output: event.target.value })} />
            </label>
          </div>
        )}

        <div className="workflow-inspector-card">
          <span><FileSearch size={15} /></span>
          <div>
            <strong>MIMO TTS 接入位</strong>
            <p>后续可把 TTS 节点接到 MIMO，直接返回音频路径、真实时长和字幕时间戳。</p>
          </div>
        </div>
      </aside>
    </section>
  );
}

function AiStudioLayout() {
  const [aiInput, setAiInput] = useState('');
  const [aiAssets, setAiAssets] = useState([]);
  const [aiReply, setAiReply] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const hasAiImageResult = aiAssets.length > 0;
  const hasAiTextResult = Boolean(aiReply);
  const hasAiResult = hasAiImageResult || hasAiTextResult;

  const submitAiPrompt = async () => {
    const prompt = aiInput.trim();
    if (!prompt || isAiLoading) return;

    setIsAiLoading(true);
    setAiAssets([]);
    setAiReply('');

    try {
      const endpoint = /素材|图片|车标|立标|金葵花|找.*图|搜索.*图/.test(prompt)
        ? 'search-images'
        : 'assistant';
      const response = await fetch(`http://127.0.0.1:8790/ai/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          module: 'AI智库',
          subModule: 'AI智库助手',
          context: {
            product: '红旗知识工作台',
            abilities: ['知识库信息搜索', 'AI内容制作', '内容信息审核'],
          },
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'AI 服务暂时没有返回结果');
      }
      const matches = Array.isArray(result.matches) ? result.matches : [];
      setAiAssets(matches);
      if (matches.length === 0) {
        setAiReply(String(result.reply || '').trim());
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const processSelectedImages = async (selectedItems, instruction) => {
    if (!Array.isArray(selectedItems) || selectedItems.length === 0 || isAiProcessing) return;

    setIsAiProcessing(true);
    try {
      const response = await fetch('http://127.0.0.1:8790/ai/process-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: instruction || aiInput,
          assets: selectedItems,
          module: 'AI智库',
          subModule: '图片AI处理',
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || '图片 AI 处理失败');
      }
      const generated = result.generated;
      if (generated?.url) {
        return {
          id: `generated-${generated.id}`,
          title: generated.title || 'AI创作结果',
          url: generated.url,
          sourcePath: generated.sourcePath,
          fileName: generated.fileName,
          description: '基于所选素材生成的 AI 图片',
          reason: 'AI处理结果',
        };
      }
    } catch (error) {
      console.error(error);
      return {
        error: error.message || '图片 AI 处理失败，请稍后再试',
      };
    } finally {
      setIsAiProcessing(false);
    }
    return null;
  };

  return (
    <section className={`ai-studio ${hasAiResult ? 'is-results' : ''} ${isAiLoading ? 'is-loading' : ''}`}>
      {!hasAiResult && (
        <>
          <div className="ai-studio-header">
            <SplitText
              tag="h1"
              text="智旗灵思，知行有方"
              delay={55}
              textAlign="center"
            />
            <SplitText
              tag="p"
              className="ai-studio-description"
              text="围绕红旗知识库完成资料搜索、内容制作与信息审核，让用户用一句自然语言就能调用资料、整理表达、校验口径，把复杂的内容生产流程收束到一个 AI 工作入口。"
              delay={12}
              textAlign="center"
            />
          </div>

          <div className="ai-studio-grid">
            {aiFeatureCards.map((card) => (
              <article key={card.id} className={`ai-studio-tile is-${card.tone}`}>
                <div className="ai-studio-tile-inner">
                  <p>{card.lead}</p>
                  <h3>{card.title}</h3>
                  <span>{card.note}</span>
                  <div className="ai-studio-tile-examples">
                    {card.examples.map((example) => (
                      <b key={example}>{example}</b>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {hasAiImageResult && (
        <div className="ai-studio-result-stage">
          {aiAssets.length > 0 && (
            <ParallaxCards
              items={aiAssets}
              cardCount={12}
              title="或许你可以这样做..."
              eyebrow="智旗灵思，知行有方"
              description="你可以直接点击下载，进入图片选择后批量下载；也可以先选择图片，再进入 AI 创作流程，让素材继续参与内容生成。"
              actions={[
                {
                  id: 'back',
                  label: '返回',
                  icon: RotateCcw,
                  onClick: () => {
                    setAiAssets([]);
                    setAiReply('');
                    setAiInput('');
                  },
                },
                {
                  id: 'download',
                  label: '下载',
                  icon: Download,
                },
                {
                  id: 'process',
                  label: isAiProcessing ? '处理中' : 'AI处理',
                  icon: Sparkles,
                  disabled: isAiProcessing,
                  onClick: processSelectedImages,
                },
              ]}
              className="ai-studio-showcase"
            />
          )}
        </div>
      )}

      {hasAiTextResult && (
        <div className="ai-studio-reply-stage">
          <div className="ai-studio-reply-card">
            <SplitText
              tag="h2"
              text="AI智库助手"
              delay={36}
              textAlign="center"
            />
            <p>{aiReply}</p>
            <button
              type="button"
              onClick={() => {
                setAiReply('');
                setAiInput('');
              }}
            >
              <RotateCcw size={15} />
              返回
            </button>
          </div>
        </div>
      )}

      <div className={`ai-studio-composer ${isAiLoading ? 'is-loading' : ''} ${hasAiResult ? 'is-result' : ''}`}>
        <div className="ai-studio-input-row">
          <textarea
            value={aiInput}
            onChange={(event) => setAiInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitAiPrompt();
              }
            }}
            placeholder="试着输入：我想搜索一下关于红旗HQ9的一些信息"
            rows="2"
          />
          <button
            type="button"
            onClick={submitAiPrompt}
            disabled={!aiInput.trim() || isAiLoading}
            aria-label={isAiLoading ? '正在搜索' : '发送'}
          >
            <SendHorizontal size={20} />
          </button>
        </div>
        <div className="ai-studio-progress-orb" aria-hidden={!isAiLoading}>
          <LoaderCircle size={24} />
        </div>
      </div>
    </section>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('ai');
  const [activeSubTab, setActiveSubTab] = useState('assistant');
  const [displayTab, setDisplayTab] = useState('ai');
  const [displaySubTab, setDisplaySubTab] = useState('assistant');
  const [isContentVisible, setIsContentVisible] = useState(true);
  const [activeTopMenu, setActiveTopMenu] = useState(null);
  const [visibleTopMenu, setVisibleTopMenu] = useState(null);
  const [isTopbarHidden, setIsTopbarHidden] = useState(false);
  const topMenuCloseTimer = useRef(null);
  const minorNavRef = useRef(null);
  const minorLabelRefs = useRef({});
  const [minorIndicator, setMinorIndicator] = useState({ left: 0, width: 0 });
  const active = useMemo(() => majorTabs.find((item) => item.id === activeTab) || majorTabs[0], [activeTab]);
  const activeSubTabs = active.subTabs || [];

  useEffect(() => {
    if (!activeSubTabs.some((item) => item.id === activeSubTab)) {
      setActiveSubTab(activeSubTabs[0]?.id || '');
    }
  }, [activeSubTab, activeSubTabs]);

  useEffect(() => {
    setIsContentVisible(false);
    const timeout = window.setTimeout(() => {
      setDisplayTab(activeTab);
      setDisplaySubTab(activeSubTab);
      setIsContentVisible(true);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === displayTab) {
      setDisplaySubTab(activeSubTab);
    }
  }, [activeSubTab, activeTab, displayTab]);

  useEffect(() => {
    if (activeTab === 'ai') {
      setIsTopbarHidden(false);
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [activeTab]);

  useEffect(() => {
    const handleWheel = (event) => {
      if (activeTab === 'ai') {
        setIsTopbarHidden(false);
        return;
      }
      if (event.deltaY > 8) {
        closeTopMenu();
        setIsTopbarHidden(true);
      }
      if (window.scrollY < 8) {
        setIsTopbarHidden(false);
      }
    };

    const handleScroll = () => {
      if (activeTab === 'ai') {
        setIsTopbarHidden(false);
        return;
      }
      if (window.scrollY < 8) {
        setIsTopbarHidden(false);
      } else {
        closeTopMenu();
        setIsTopbarHidden(true);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [activeTab]);

  useLayoutEffect(() => {
    const nav = minorNavRef.current;
    const label = minorLabelRefs.current[displaySubTab];
    if (!nav || !label) return;
    const navRect = nav.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    setMinorIndicator({
      left: labelRect.left - navRect.left,
      width: labelRect.width,
    });
  }, [activeTab, activeSubTab, displayTab, displaySubTab]);

  const openTopMenu = (key) => {
    if (topMenuCloseTimer.current) {
      window.clearTimeout(topMenuCloseTimer.current);
      topMenuCloseTimer.current = null;
    }
    setVisibleTopMenu(key);
    setActiveTopMenu(key);
  };

  const closeTopMenu = () => {
    setActiveTopMenu(null);
    if (topMenuCloseTimer.current) window.clearTimeout(topMenuCloseTimer.current);
    topMenuCloseTimer.current = window.setTimeout(() => {
      setVisibleTopMenu(null);
      topMenuCloseTimer.current = null;
    }, 280);
  };

  useEffect(() => () => {
    if (topMenuCloseTimer.current) window.clearTimeout(topMenuCloseTimer.current);
  }, []);

  const contentMap = {
    ai: {
      assistant: [
        { id: 'entry', label: 'AI 智库助手', icon: Sparkles, text: '先把需求收束，再接知识库和生成能力。' },
      ],
    },
    library: {
      seed: seedContentCards,
      product: knowledgeCategories.slice(1, 7),
      craft: knowledgeCategories.slice(2, 8),
      competitor: knowledgeCategories.slice(3, 9),
      talk: knowledgeCategories.slice(0, 6),
      industry: knowledgeCategories.slice(1, 7),
      policy: knowledgeCategories.slice(2, 8),
      search: knowledgeCategories.slice(3, 9),
    },
    data: {
      publish: dataItems.slice(0, 6),
      play: dataItems.slice(0, 6),
      asset: dataItems.slice(0, 6),
    },
  };

  const renderTab = contentMap[displayTab] || {};
  const heroCards = renderTab[displaySubTab] || majorTabs.find((item) => item.id === displayTab)?.subTabs?.slice(0, 6) || [];

  return (
    <main className={`starter-page ${displayTab === 'ai' ? 'is-ai-page' : ''}`}>
      <header className={`starter-topbar ${isTopbarHidden ? 'is-hidden' : ''}`}>
        <nav className="nav14" aria-label="顶部导航" onMouseLeave={closeTopMenu}>
          <div className="nav14-bar">
            <a className="nav14-brand" href="#">
              <span className="nav14-logo">v</span>
              <strong>红旗知识工作台</strong>
            </a>

            <div className="nav14-links">
              {topNavKeys.map((key) => {
                const section = topNavSections[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={activeTopMenu === key ? 'active' : ''}
                    onMouseEnter={() => openTopMenu(key)}
                    onFocus={() => openTopMenu(key)}
                    onClick={() => (activeTopMenu === key ? closeTopMenu() : openTopMenu(key))}
                  >
                    {section.label}
                    <ChevronDown size={14} />
                  </button>
                );
              })}
              <a href="#" onMouseEnter={closeTopMenu}>帮助文档</a>
            </div>

            <div className="nav14-actions">
              <a href="#">717专题</a>
              <button type="button">进入工作台</button>
            </div>
          </div>

          <div className={`nav14-panel ${activeTopMenu ? 'open' : ''}`}>
            {visibleTopMenu && (
              <div className="nav14-panel-inner">
                <div className="nav14-panel-items">
                  {topNavSections[visibleTopMenu].items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a key={item.title} href="#" className="nav14-panel-item">
                        <span><Icon size={17} /></span>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </a>
                    );
                  })}
                </div>

                <a href="#" className="nav14-featured">
                  <span>{topNavSections[visibleTopMenu].featured.tag}</span>
                  <strong>{topNavSections[visibleTopMenu].featured.title}</strong>
                  <p>{topNavSections[visibleTopMenu].featured.description}</p>
                  <b>查看详情 <ArrowRight size={14} /></b>
                </a>
              </div>
            )}
          </div>
        </nav>
      </header>

      <section className="starter-hero-band">
        <div className="starter-nav-stack">
          <nav className="starter-major-nav" aria-label="主功能">
            {majorTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? 'active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <nav className="starter-minor-nav" aria-label="子功能" ref={minorNavRef}>
            {activeSubTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === activeSubTab ? 'active' : ''}
                onClick={() => setActiveSubTab(item.id)}
              >
                <span
                  ref={(node) => {
                    minorLabelRefs.current[item.id] = node;
                  }}
                  className="starter-minor-label"
                >
                  {item.label}
                </span>
              </button>
            ))}
            <span
              className="starter-minor-indicator"
              style={{
                transform: `translateX(${minorIndicator.left}px)`,
                width: minorIndicator.width,
              }}
            />
          </nav>
        </div>
      </section>

      <section className={`starter-shell ${displayTab === 'ai' ? 'is-ai-shell' : ''}`}>
        <div className={`starter-content-stage ${displayTab === 'ai' ? 'is-ai-stage' : ''} ${isContentVisible ? 'is-visible' : 'is-fading'}`}>
          {displayTab === 'ai' && displaySubTab === 'workflow' ? (
            <WorkflowCanvasLayout />
          ) : displayTab === 'ai' ? (
            <AiStudioLayout />
          ) : displayTab === 'library' && displaySubTab === 'seed' ? (
            <SeedContentLayout />
          ) : displayTab === 'library' && displaySubTab === 'product' ? (
            <ProductKnowledgeLayout />
          ) : (
            <section className="starter-grid">
              {heroCards.map((card) => {
                const Icon = card.icon || (displayTab === 'library' ? LayoutGrid : displayTab === 'data' ? BarChart3 : Sparkles);
                return (
                  <article key={card.id || card.label} className={`starter-card ${card.cover ? 'has-cover' : ''}`}>
                    {card.cover && (
                      <div className="starter-card-cover">
                        <img src={card.cover} alt="" />
                      </div>
                    )}
                    <header className="starter-card-head">
                      <div>
                        <h3>{card.label || card.title}</h3>
                        <p>{card.subtitle || card.note || card.text}</p>
                      </div>
                      <button type="button" className="starter-card-menu" aria-label="更多操作">
                        <span>··</span>
                      </button>
                    </header>

                    <div className="starter-card-body">
                      {displayTab === 'library' && (
                        <>
                          <p className="starter-card-note">{card.note}</p>
                          <div className="starter-card-chip-row">
                            <span>{card.count}</span>
                            <span>可筛选</span>
                          </div>
                        </>
                      )}
                      {displayTab === 'data' && (
                        <>
                          <p className="starter-card-note">{card.hint}</p>
                          <div className="starter-card-chip-row">
                            <span>{card.value}</span>
                            <span>规划中</span>
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
