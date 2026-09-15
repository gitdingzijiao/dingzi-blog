// DingLang 网页示例代码
window.DING_EXAMPLES = [
  {
    id: 'hello',
    name: '你好，世界',
    desc: '中文变量、字符串插值',
    code: `# DingLang 示例 —— 中文变量名
let 名字 = "世界"
let 问候 = "你好"

print("{问候}，{名字}！")

# 变量和算术
let x = 10
let y = 3
print("x + y = {x + y}")
print("x * y = {x * y}")

# if 是表达式，有返回值
let 分数 = 85
let 等级 = if 分数 >= 90 { "优" } else if 分数 >= 80 { "良" } else { "及格" }
print("{分数} 分的等级是 {等级}")`,
  },
  {
    id: 'tibetan',
    name: '藏文标识符',
    desc: '变量名、函数名都能用藏文',
    code: `# 藏文变量名（含音节点 ་ tsheg）
let བོད་ཡིག = "藏文"
let བཀྲ་ཤིས་བདེ་ལེགས = "吉祥如意"
let ཐུགས་རྗེ་ཆེ = "谢谢"

print("བོད་ཡིག = {བོད་ཡིག}")
print("བཀྲ་ཤིས་བདེ་ལེགས = {བཀྲ་ཤིས་བདེ་ལེགས}")
print("ཐུགས་རྗེ་ཆེ = {ཐུགས་རྗེ་ཆེ}")

# 藏文变量参与运算
let གཅིག = 1
let གཉིས = 2
let གསུམ = 3
print("གཅིག + གཉིས + གསུམ = {གཅིག + གཉིས + གསུམ}")

# 藏文函数名
fn བསྡོམས(a, b) = a + b
fn ཕྱིར་ཐོན(n) = n * n
print("བསྡོམས(10, 20) = {བསྡོམས(10, 20)}")
print("ཕྱིར་ཐོན(7) = {ཕྱིར་ཐོན(7)}")

# 藏文循环变量
let ཨང་ཀི = []
for ཨང in 1..=10 {
  ཨང་ཀི = ཨང་ཀི + [ཨང * ཨང]
}
print("1到10的平方: {ཨང་ཀི}")`,
  },
  {
    id: 'fib',
    name: '函数与循环',
    desc: '两种函数写法、范围循环、列表',
    code: `# 表达式体函数
fn 平方(n) = n * n

# 块体函数（需要 return）
fn 斐波那契(n) {
  if n <= 1 { return n }
  let a = 0
  let b = 1
  for i in 2..=n {
    let 临时 = a + b
    a = b
    b = 临时
  }
  return b
}

print("平方:")
for i in 1..=10 {
  print("  {i}² = {平方(i)}")
}

print()
print("斐波那契前 15 项:")
let 数列 = []
for i in 0..15 {
  数列 = 数列 + [斐波那契(i)]
}
print("  {数列}")

# 范围循环求和
let 和 = 0
for i in 1..=100 { 和 = 和 + i }
print()
print("1 加到 100 = {和}")

# 范围还能倒着数
let 倒数 = []
for i in 5..=1 { 倒数 = 倒数 + [i] }
print("倒着数: {倒数}")`,
  },
  {
    id: 'list',
    name: '列表操作',
    desc: '遍历、求和、找最大',
    code: `fn 求和(列表) {
  let 总 = 0
  for x in 列表 { 总 = 总 + x }
  return 总
}

fn 最大(列表) {
  let m = 列表[0]
  for x in 列表 {
    if x > m { m = x }
  }
  return m
}

fn 计数(列表, 目标) {
  let n = 0
  for x in 列表 {
    if x == 目标 { n = n + 1 }
  }
  return n
}

let 成绩 = [88, 92, 75, 96, 83, 92, 68, 92, 79, 85]

print("数据:   {成绩}")
print("人数:   {len(成绩)}")
print("总分:   {求和(成绩)}")
print("平均分: {求和(成绩) / len(成绩)}")
print("最高分: {最大(成绩)}")
print("92分人数: {计数(成绩, 92)}")

# 分档
let 优秀 = []
let 其他 = []
for s in 成绩 {
  if s >= 90 { 优秀 = 优秀 + [s] } else { 其他 = 其他 + [s] }
}
print()
print("优秀(≥90): {优秀}")
print("其他:      {其他}")`,
  },
  {
    id: 'error',
    name: '错误处理演示',
    desc: '看看报错信息有多详细',
    code: `# 试着把下面任意一行的注释去掉，看看报错效果

let x = 10

# ① 变量名冲突：藏文音节点和下划线会撞车
# let བོད་ཡིག = 1
# let བོད_ཡིག = 2

# ② 语法错误：括号不匹配
# print(1 + 2

# ③ 语法错误：运算符不是字母
# let y = (+ 1 2)

# ④ 语义错误：break 只能用在循环里
# break

# ⑤ 运行时错误：除以零不会报错，但调用不存在的函数会
# 不存在(1)

print("x = {x}")
print("去掉上面某行的注释，再点运行，看看报错信息")`,
  },
];
