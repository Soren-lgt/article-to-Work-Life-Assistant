// AI生成
// P6：深度学习示例题库（选择 44 题：24 单选 / 8 多选 / 12 判断；问答 6 题；代码 3 题），用于验证顺序练习与考试配额抽题
import { Quiz } from './quiz.js';

export const DL_SINGLE = [
  { stem: '神经网络反向传播算法主要依据的数学规则是？', options: ['链式法则', '大数定律', '勾股定理', '抽屉原理'], answer: '链式法则', analysis: '反向传播通过链式法则从输出层逐层求偏导。' },
  { stem: 'ReLU 激活函数的表达式是？', options: ['max(0, x)', '1 / (1 + e^-x)', 'tanh(x)', 'x^2'], answer: 'max(0, x)', analysis: 'ReLU 在负半轴输出 0，正半轴保持线性。' },
  { stem: '模型在训练集上表现很好、在测试集上明显变差，这种现象称为？', options: ['过拟合', '欠拟合', '梯度消失', '梯度爆炸'], answer: '过拟合', analysis: '过拟合的记忆了训练集噪声，泛化能力下降。' },
  { stem: 'Dropout 的主要作用是？', options: ['随机失活部分神经元以抑制过拟合', '提高学习率', '增加网络层数', '加速数据读取'], answer: '随机失活部分神经元以抑制过拟合' },
  { stem: '批量归一化（BatchNorm）的主要作用是？', options: ['对每层输入做归一化以稳定训练', '随机丢弃输入', '减少类别数', '提升显存占用'], answer: '对每层输入做归一化以稳定训练' },
  { stem: '卷积层采用参数共享的主要好处是？', options: ['显著减少参数量', '提高图像分辨率', '增加通道数', '完全避免梯度消失'], answer: '显著减少参数量' },
  { stem: '池化层（如最大池化）的主要作用是？', options: ['下采样、降低特征图尺寸并保留主要特征', '增加参数量', '生成概率分布', '计算梯度'], answer: '下采样、降低特征图尺寸并保留主要特征' },
  { stem: 'Transformer 的核心结构是？', options: ['自注意力机制', '卷积核', '循环单元', '池化窗口'], answer: '自注意力机制' },
  { stem: '学习率设置过大最可能导致？', options: ['损失震荡甚至不收敛', '训练速度明显变慢', '模型参数变少', '数据泄漏'], answer: '损失震荡甚至不收敛' },
  { stem: 'Softmax 函数输出的特点是？', options: ['各类概率非负且和为 1', '输出任意实数', '只输出 0 或 1', '输出梯度'], answer: '各类概率非负且和为 1' },
  { stem: '多分类任务中最常用的损失函数是？', options: ['交叉熵损失', '均方误差', 'L1 损失', '合页损失'], answer: '交叉熵损失' },
  { stem: 'Adam 优化器结合了哪两种思想？', options: ['动量与 RMSProp 的自适应学习率', '卷积与池化', '正则化与早停', '编码与解码'], answer: '动量与 RMSProp 的自适应学习率' },
  { stem: '深层网络使用 Sigmoid 激活时最容易出现？', options: ['梯度消失', '数据增强失效', '类别数过多', '参数量为零'], answer: '梯度消失' },
  { stem: '残差连接（ResNet）主要缓解的问题是？', options: ['深层网络退化与梯度消失', '数据不平衡', '显存不足', '类别过多'], answer: '深层网络退化与梯度消失' },
  { stem: '下列属于常用正则化手段的是？', options: ['L2 权重衰减', '增大批大小', '提高学习率', '增加输出维度'], answer: 'L2 权重衰减' },
  { stem: '图像任务中常用的数据增强方式是？', options: ['随机裁剪与翻转', '删除标签', '减少通道', '把图像缩到 1 像素'], answer: '随机裁剪与翻转' },
  { stem: '随机梯度下降（SGD）每次参数更新使用？', options: ['一小批样本估计的梯度', '全部样本的精确梯度', '单个特征的梯度', '随机常数'], answer: '一小批样本估计的梯度' },
  { stem: '早停法（Early Stopping）的做法是？', options: ['验证集指标不再提升时停止训练', '提前清空数据集', '提前把学习率降到 0', '提前删除网络层'], answer: '验证集指标不再提升时停止训练' },
  { stem: 'GPU 在大模型训练中的主要优势是？', options: ['并行矩阵运算能力强', '存储容量无限', '不需要计算梯度', '可以自动标注数据'], answer: '并行矩阵运算能力强' },
  { stem: '评估二分类模型最常用的表格是？', options: ['混淆矩阵', '哈希表', '决策树', '词向量表'], answer: '混淆矩阵' },
  { stem: '精确率（Precision）的计算公式是？', options: ['TP / (TP + FP)', 'TP / (TP + FN)', '(TP + TN) / 总数', '2PR / (P + R)'], answer: 'TP / (TP + FP)' },
  { stem: '召回率（Recall）的计算公式是？', options: ['TP / (TP + FN)', 'TP / (TP + FP)', 'TN / (TN + FP)', 'FP / (FP + TN)'], answer: 'TP / (TP + FN)' },
  { stem: 'F1 分数的计算方式是？', options: ['精确率与召回率的调和平均', '精确率与召回率的算术平均', '准确率的平方', '损失值的倒数'], answer: '精确率与召回率的调和平均' },
  { stem: '迁移学习的常见做法是？', options: ['用预训练模型权重初始化后微调', '从零随机初始化', '冻结全部层且只训练输入层', '删除全部预训练权重'], answer: '用预训练模型权重初始化后微调' },
];

export const DL_MULTIPLE = [
  { stem: '下列属于常见激活函数的有？', options: ['ReLU', 'Sigmoid', 'Tanh', 'MaxPooling'], answer: ['ReLU', 'Sigmoid', 'Tanh'] },
  { stem: '下列有助于缓解过拟合的措施有？', options: ['Dropout', 'L2 正则化', '数据增强', '无限增加网络深度'], answer: ['Dropout', 'L2 正则化', '数据增强'] },
  { stem: '下列属于优化器的有？', options: ['SGD', 'Adam', 'RMSProp', 'ReLU'], answer: ['SGD', 'Adam', 'RMSProp'] },
  { stem: '卷积神经网络（CNN）的常见组成包括？', options: ['卷积层', '池化层', '全连接层', '词嵌入层'], answer: ['卷积层', '池化层', '全连接层'] },
  { stem: '分类任务常用的评价指标包括？', options: ['准确率', '精确率', '召回率', '学习率'], answer: ['准确率', '精确率', '召回率'] },
  { stem: '下列属于归一化 / 标准化方法的有？', options: ['BatchNorm', 'LayerNorm', 'GroupNorm', 'Dropout'], answer: ['BatchNorm', 'LayerNorm', 'GroupNorm'] },
  { stem: '数据预处理常见操作包括？', options: ['归一化', '标准化', '数据增强', '反向传播'], answer: ['归一化', '标准化', '数据增强'] },
  { stem: '关于训练损失与验证损失，下列说法正确的有？', options: ['训练损失很低而验证损失高通常说明过拟合', '验证集常用于选择模型与早停', '训练集与验证集应来自同一分布', '验证损失越低说明训练集准确率一定越低'], answer: ['训练损失很低而验证损失高通常说明过拟合', '验证集常用于选择模型与早停', '训练集与验证集应来自同一分布'] },
];

export const DL_JUDGE = [
  { stem: '反向传播需要借助链式法则计算各层梯度。', answer: '对' },
  { stem: '学习率越大，模型一定收敛得越好。', answer: '错' },
  { stem: 'Dropout 通常在训练阶段启用、推理阶段关闭。', answer: '对' },
  { stem: '池化层一般没有需要学习的参数。', answer: '对' },
  { stem: 'BatchNorm 在推理阶段使用训练期累积的滑动平均统计量。', answer: '对' },
  { stem: '交叉熵损失适合直接用于回归任务。', answer: '错' },
  { stem: '卷积核越大，模型参数量一定越少。', answer: '错' },
  { stem: 'Transformer 可以并行处理序列中的多个位置。', answer: '对' },
  { stem: '梯度爆炸可以通过梯度裁剪缓解。', answer: '对' },
  { stem: '训练集准确率越高，模型泛化能力一定越强。', answer: '错' },
  { stem: '残差连接通过跳跃连接缓解深层网络的梯度消失。', answer: '对' },
  { stem: '数据增强通常有助于提升模型泛化能力。', answer: '对' },
];

export const DL_QA = [
  {
    stem: '什么是过拟合？如何缓解？',
    answer: '过拟合指模型在训练集上表现很好、在测试集上明显变差，泛化能力不足。常见缓解方法有增加训练数据、数据增强、Dropout、L2 正则化和早停。',
    keywords: ['训练集', '测试集', '泛化'],
  },
  {
    stem: '简述梯度下降的基本思想。',
    answer: '沿着损失函数对参数的梯度反方向，按学习率逐步更新参数，使损失不断下降。',
    keywords: ['梯度', '学习率'],
  },
  {
    stem: 'Dropout 的原理是什么？',
    answer: '训练时按概率随机把部分神经元的输出置零，减少神经元之间的共适应；推理时使用全部神经元并做尺度补偿。',
    keywords: ['随机', '神经元'],
  },
  {
    stem: 'BatchNorm 为什么能稳定训练？',
    answer: '它对每层输入按小批量统计做归一化，使激活分布更稳定，从而允许更大学习率并加快收敛。',
    keywords: ['归一化', '稳定'],
  },
  {
    stem: '卷积层参数共享有什么好处？',
    answer: '参数共享让同一个卷积核在整张特征图上滑动复用，大幅减少参数量，并带来平移等变性。',
    keywords: ['参数', '共享'],
  },
  {
    stem: '评价分类模型常用哪些指标？',
    answer: '常用准确率、精确率、召回率和 F1 分数；类别不平衡时更关注精确率与召回率。',
    keywords: ['精确率', '召回率'],
  },
];

export const DL_CODE = [
  {
    stem: '用 PyTorch 定义一个单层线性回归模型，并在前向传播中返回预测值。',
    lang: 'python',
    hint: '继承 nn.Module，并在 __init__ 中注册线性层。',
    refCode: "import torch\nimport torch.nn as nn\n\nclass LinearRegression(nn.Module):\n    def __init__(self, in_features):\n        super().__init__()\n        self.linear = nn.Linear(in_features, 1)\n\n    def forward(self, x):\n        return self.linear(x)\n\nmodel = LinearRegression(3)",
  },
  {
    stem: '用 NumPy 实现 ReLU 激活函数，支持数组输入。',
    lang: 'python',
    hint: '用 np.maximum(0, x) 即可。',
    refCode: "import numpy as np\n\ndef relu(x):\n    x = np.asarray(x, dtype=float)\n    return np.maximum(0, x)",
  },
  {
    stem: '用 PyTorch 计算一个 batch 的交叉熵损失。',
    lang: 'python',
    hint: '交叉熵损失接收未经过 Softmax 的 logits。',
    refCode: "import torch\nimport torch.nn as nn\n\nlogits = torch.randn(4, 10)\ntarget = torch.tensor([3, 7, 1, 9])\nloss_fn = nn.CrossEntropyLoss()\nloss = loss_fn(logits, target)",
  },
];

export const DEEP_LEARNING_SEED = {
  choiceBank: '深度学习基础',
  qaBank: '深度学习问答',
  codeBank: '深度学习代码',
  single: DL_SINGLE,
  multiple: DL_MULTIPLE,
  judge: DL_JUDGE,
  qa: DL_QA,
  code: DL_CODE,
};

export function seedSummary() {
  return {
    single: DL_SINGLE.length,
    multiple: DL_MULTIPLE.length,
    judge: DL_JUDGE.length,
    qa: DL_QA.length,
    code: DL_CODE.length,
    total: DL_SINGLE.length + DL_MULTIPLE.length + DL_JUDGE.length + DL_QA.length + DL_CODE.length,
  };
}

// 一键装载深度学习示例题库（幂等：同名题库已存在则跳过）
export async function seedDeepLearning(repo, accountId) {
  if (!accountId) throw new Error('请先登录账号');
  const created = [];
  const skipped = [];
  let questions = 0;

  async function ensureBank(categoryKey, name) {
    const banks = await Quiz.listBanks(repo, accountId, categoryKey);
    const exist = banks.find((b) => b.name === name);
    if (exist) { skipped.push(name); return { bank: exist, fresh: false }; }
    const bank = await Quiz.addBank(repo, accountId, categoryKey, name);
    created.push(name);
    return { bank, fresh: true };
  }

  const choice = await ensureBank('choice', DEEP_LEARNING_SEED.choiceBank);
  if (choice.fresh) {
    for (const q of DL_SINGLE) { await Quiz.addQuestion(repo, choice.bank.id, { ...q, type: 'single' }); questions += 1; }
    for (const q of DL_MULTIPLE) { await Quiz.addQuestion(repo, choice.bank.id, { ...q, type: 'multiple' }); questions += 1; }
    for (const q of DL_JUDGE) { await Quiz.addQuestion(repo, choice.bank.id, { ...q, type: 'judge' }); questions += 1; }
  } else {
    questions += (await Quiz.listQuestions(repo, choice.bank.id)).length;
  }

  const qa = await ensureBank('qa', DEEP_LEARNING_SEED.qaBank);
  if (qa.fresh) {
    for (const q of DL_QA) { await Quiz.addQuestion(repo, qa.bank.id, q); questions += 1; }
  } else {
    questions += (await Quiz.listQuestions(repo, qa.bank.id)).length;
  }

  const code = await ensureBank('code', DEEP_LEARNING_SEED.codeBank);
  if (code.fresh) {
    for (const q of DL_CODE) { await Quiz.addQuestion(repo, code.bank.id, q); questions += 1; }
  } else {
    questions += (await Quiz.listQuestions(repo, code.bank.id)).length;
  }

  return { created, skipped, questions, ...seedSummary() };
}
