const RTL = "\u200F";

module.exports = [
  {
    number: 1,
    key: "steam_profile",
    arabic: `${RTL}ما هو رابط حسابك على الستيم؟${RTL}`,
    english: "What is your Steam profile link?",
    type: "steam_url",
    required: true,
    maxLength: 500,
  },
  {
    number: 2,
    key: "age",
    arabic: `${RTL}ما هو عمرك؟${RTL}`,
    english: "What is your age?",
    type: "number",
    required: true,
    min: 13,
    max: 100,
    maxLength: 3,
  },
  {
    number: 3,
    key: "cs2_hours",
    arabic: `${RTL}كم عدد الساعات التي لعبتها في CS2؟${RTL}`,
    english: "How many hours do you have in CS2?",
    type: "cs2_hours",
    required: true,
    min: 1000,
    maxLength: 10,
  },
  {
    number: 4,
    key: "activity",
    arabic:
      `${RTL}كم من الوقت تقضي عادةً على السيرفر وديسكورد يوميًا؟ ` +
      `يرجى إعطاؤنا تقديرًا صادقًا لنشاطك اليومي/الأسبوعي.${RTL}`,
    english:
      "How active are you on the server and Discord? " +
      "Please give an honest estimate of your daily/weekly activity.",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 5,
    key: "admin_experience",
    arabic:
      `${RTL}هل لديك خبرة في مجال الأدمين؟ إذا كانت الإجابة نعم، ` +
      `أخبرنا عن خبرتك واذكر السيرفرات التي كنت أدمنًا فيها.${RTL}`,
    english:
      "Do you have previous experience managing CS2 servers? " +
      "If yes, list the servers you worked on and explain your responsibilities.",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 6,
    key: "plugin_experience",
    arabic:
      `${RTL}ما هي خبرتك مع إضافات CS2 أو CounterStrikeSharp؟ ` +
      `اذكر الإضافات أو الأنظمة أو خصائص السيرفر التي سبق لك العمل عليها.${RTL}`,
    english:
      "What experience do you have with CS2 plugins or CounterStrikeSharp? " +
      "List the plugins, systems, or server features you have worked with.",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 7,
    key: "troubleshooting",
    arabic:
      `${RTL}إذا توقفت إضافة عن العمل أو ظهر خطأ في Console الخاص بالسيرفر، ` +
      `ماذا ستفعل؟ اشرح لنا خطواتك في حل المشكلة.${RTL}`,
    english:
      "If a plugin stops working or an error appears in the server console, " +
      "what would you do? Explain your troubleshooting process.",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 8,
    key: "server_configuration",
    arabic:
      `${RTL}هل لديك خبرة في إعدادات السيرفر، الصلاحيات، قواعد البيانات، ` +
      `أو ملفات إعداد CS2؟ اشرح لنا ما الذي تستطيع التعامل معه.${RTL}`,
    english:
      "Do you have experience with server configuration, permissions, databases, " +
      "or CS2 configuration files? Explain what you can work with.",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 9,
    key: "friends_and_admin_abuse",
    arabic:
      `${RTL}كيف ستتعامل مع لاعب يخالف قوانين السيرفر حتى وإن كان صديقًا لك؟ ` +
      `وكيف ستتعامل مع أدمن آخر يسيء استخدام صلاحياته ضد اللاعبين؟${RTL}`,
    english:
      "How would you handle a player breaking the rules if they were your friend? " +
      "How would you handle another admin abusing their permissions against players?",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 10,
    key: "why_rh",
    arabic:
      `${RTL}لماذا تريد الانضمام إلى طاقم راس الحانوت؟ ` +
      `وفي ماذا تستطيع مساعدة السيرفر بعيدًا عن معاقبة اللاعبين؟${RTL}`,
    english:
      "Why do you want to join the RH Admin Team, " +
      "and what can you contribute to the server besides player moderation?",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 11,
    key: "cheater_report",
    arabic:
      `${RTL}لاعب قام بالتبليغ عن شخص يشتبه بأنه يستخدم الغش، ` +
      `ولكنك شخصيًا لم تلاحظ أي شيء مريب. ماذا ستفعل قبل اتخاذ أي إجراء؟${RTL}`,
    english:
      "A player reports someone for cheating, but you personally don't see anything suspicious. " +
      "What would you do before taking action?",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 12,
    key: "suspected_cheater",
    arabic:
      `${RTL}أنت تراقب لاعبًا مشتبهًا به باستخدام الغش، وفجأة بدأ يلعب بشكل طبيعي ` +
      `لأنه لاحظ وجود أدمن يراقبه. كيف ستقوم بالتحقيق في الأمر؟${RTL}`,
    english:
      "You are spectating a suspected cheater and they suddenly start playing normally " +
      "because they know an admin is watching. How would you investigate?",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 13,
    key: "insulting_admin",
    arabic:
      `${RTL}إذا بدأ لاعب بشتمك أو إهانتك بعد أن قمت بتحذيره، واستمر في ذلك ` +
      `دون أن يرتكب مخالفة أخرى بشكل مباشر، كيف ستتعامل مع الموقف؟${RTL}`,
    english:
      "A player starts insulting you after you warn them. " +
      "They continue but never directly break another rule. How would you handle the situation?",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 14,
    key: "admin_mistake",
    arabic:
      `${RTL}إذا ارتكبت خطأ كأدمن وقمت بمعاقبة اللاعب الخطأ، ` +
      `ماذا ستفعل مباشرة بعد اكتشاف الخطأ؟${RTL}`,
    english:
      "You make an admin mistake and punish the wrong player. " +
      "What would you do immediately after realizing it?",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 15,
    key: "admin_orders",
    arabic:
      `${RTL}إذا طلب منك أدمن آخر معاقبة لاعب، ولكنك لم تشاهد ما حدث بنفسك، ` +
      `هل ستقوم بمعاقبته؟ اشرح السبب.${RTL}`,
    english:
      "An admin tells you to punish a player, but you did not personally witness what happened. " +
      "Would you do it? Explain why.",
    type: "text",
    required: true,
    maxLength: 4000,
  },
  {
    number: 16,
    key: "vip_rule_break",
    arabic:
      `${RTL}إذا قام لاعب مشهور أو VIP بمخالفة أحد قوانين السيرفر، ` +
      `وبدأ عدة لاعبين يطلبون منك عدم معاقبته، ماذا ستفعل؟${RTL}`,
    english:
      "A popular player or VIP breaks a server rule, and several players ask you not to punish them. " +
      "What would you do?",
    type: "text",
    required: true,
    maxLength: 4000,
  },
];
