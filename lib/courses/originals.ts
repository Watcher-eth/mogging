export type CourseLesson = {
  id: string;
  title: string;
  minutes: number;
  intro: string;

  guide: {
    title: string;
    kind:
      | "light"
      | "position"
      | "focus"
      | "checklist"
      | "routine"
      | "timeline"
      | "trend"
      | "journal";
    afterSection: number;
  };
  controls: [string, string, string];
  captions: [string, string, string];
  sections: { title: string; body: string }[];
  question: string;
  answers: [string, string];
  correct: 0 | 1;
  explanation: string;
  source?: { title: string; url: string };
};
export type Course = {
  id: string;
  title: string;
  subtitle: string;
  publishedAt: string;

  lessons: CourseLesson[];
};

export const courses: Course[] = [
  {
    id: "capture",
    publishedAt: "2026-10-20T00:00:00Z",
    title: "The repeatable scan.",
    subtitle:
      "Light. Position. Baseline. Learn to make every check-in comparable.",
    lessons: [
      {
        id: "capture-light",
        guide: {
          title: "See what light changes",
          kind: "light",
          afterSection: 0,
        },
        title: "Find your light",
        minutes: 4,
        intro:
          "A different light can look like a different result. Start with conditions you can repeat.",
        controls: ["Side light", "Front light", "Overhead"],
        captions: [
          "Side light creates strong shadows on one side.",
          "Soft, even light makes details easier to compare.",
          "Overhead light can deepen shadows around the eyes.",
        ],
        sections: [
          {
            title: "Face the light",
            body: "Stand facing a window with indirect daylight. Keep the window roughly behind your camera rather than behind your head. If sunlight makes you squint or creates a hard stripe across your face, move farther into the room or use a sheer curtain. Turn off strong overhead lights so you are not mixing two very different light sources.\n\nCheck both cheeks and the area under your eyes before taking a photo. You are looking for readable detail on both sides, not a dramatic portrait. The interactive example below keeps the face fixed while changing the direction of the simulated light. Notice how the shadows alone change the impression.",
          },
          {
            title: "Make it repeatable",
            body: "Choose a position you can find again. A floorboard, a chair, or the edge of a desk makes a useful reference. Use the same room and a similar time of day, but check the light itself: a sunny afternoon and an overcast afternoon can look different even when the clock matches.\n\nKeep beauty filters, portrait effects, and flash off. Avoid changing exposure just to make the image look better. If the light is substantially different, record that with your check-in and compare cautiously. An image that looks sharper or more sculpted is not automatically evidence that your features changed.",
          },
          {
            title: "Try this before your next scan",
            body: "Take one test photo with the window to your side and another while facing it. Keep your distance, expression, and camera height the same. Compare the eye sockets, nose shadow, and cheek texture. Pick the setup that is easier to reproduce, then use it for future check-ins.\n\nYou do not need to save every test. The purpose is to understand your setup once, so later comparisons need fewer guesses.",
          },
        ],
        question: "Which setup is easiest to repeat fairly?",
        answers: [
          "Soft front light, same room",
          "A different dramatic light each time",
        ],
        correct: 0,
        explanation:
          "Consistency makes your own reports more useful. Lighting and camera processing can affect every estimate.",
      },
      {
        id: "capture-position",
        guide: {
          title: "Find a neutral angle",
          kind: "position",
          afterSection: 1,
        },
        title: "Keep your position",
        minutes: 4,
        intro:
          "Use the eye line as a guide, not a target to force your face into.",
        controls: ["Too close", "Eye level", "Tilted"],
        captions: [
          "A close wide-angle camera can change proportions.",
          "Eye-level framing keeps the view neutral.",
          "Tilting changes the apparent eye line and jaw.",
        ],
        sections: [
          {
            title: "Start at eye level",
            body: "Set the camera around the height of your eyes and look straight ahead. Keep the phone upright instead of pointing it up from your lap. A stable support or a short timer is useful if holding the phone makes your head follow your hand.\n\nGive the camera enough space to show your whole face. A very close view changes the relationship between features near the lens and features farther away. Moving closer for one scan and farther away for the next makes comparison harder, even if both images are clear.",
          },
          {
            title: "Use the guide without posing",
            body: "The guide is a framing aid, not a shape you must force your face to match. Keep your neck comfortable and let your shoulders settle. If your face sits outside the frame, move the phone or your position rather than stretching your chin toward it.\n\nIn the example, compare the close, level, and tilted views. The image and its overlay move together. Pay attention to how the eye line and apparent jaw angle change when the camera rotates, without treating any of the views as a better version of the person.",
          },
          {
            title: "Save a position you can find again",
            body: "Write down which camera you used, where you stood, and how you supported the phone. Use a familiar object or a stand as a distance reference. Recreate those details for your next scan before changing anything in your routine.\n\nIf you have to switch phones or lenses, treat the first image from the new setup as a fresh reference. Keeping that context is more useful than trying to adjust the new image until it matches the old score.",
          },
        ],
        question: "What should stay the same between scans?",
        answers: [
          "Only your hairstyle",
          "Camera height, distance, and expression",
        ],
        correct: 1,
        explanation:
          "A stable capture setup helps distinguish image variation from a consistent trend.",
      },
      {
        id: "capture-expression",
        guide: {
          title: "Relax, one area at a time",
          kind: "focus",
          afterSection: 1,
        },
        title: "Keep your expression neutral",
        minutes: 4,
        intro:
          "The same relaxed expression makes your check-ins easier to compare.",
        controls: ["Jaw", "Eyes", "Shoulders"],
        captions: [
          "Let your lips rest naturally. Avoid clenching.",
          "Look straight ahead without squinting.",
          "Lower your shoulders and breathe normally.",
        ],
        sections: [
          {
            title: "Release the pose",
            body: "Pause before pressing the shutter. Let your jaw rest comfortably, bring your lips together without pressing, and breathe normally. You should not need to hold a strained position while the timer runs.\n\nWatch for small habits that change a photo: lifting one brow, narrowing the eyes, clenching the jaw, or pushing the head forward. These can alter the visible outlines and shadows. A relaxed, repeatable expression makes your own history easier to interpret.",
          },
          {
            title: "Check one area at a time",
            body: "Use the guide to look separately at your jaw, eyes, and overall frame. The overlay shows which part of the same photograph you are reviewing. It is not an instruction to tighten that area or force symmetry.\n\nFirst relax your mouth and jaw. Then look ahead without widening or narrowing your eyes. Finally lower your shoulders and check that you have not leaned toward the camera. This short sequence is easier to repeat than trying to remember a particular pose.",
          },
          {
            title: "Choose comfort over a score",
            body: "Take a test image, lower the phone, and reset your posture. If you can comfortably return to the same expression, the setup is usable. If it requires effort or breath-holding, simplify it.\n\nKeep the neutral expression for your comparison photos. You can still take expressive photos elsewhere; the purpose of this particular image is consistency, not judging how you should look in everyday life.",
          },
        ],
        question: "What expression gives you a useful baseline?",
        answers: [
          "A comfortable, relaxed expression",
          "A clenched jaw and narrowed eyes",
        ],
        correct: 0,
        explanation:
          "A repeatable neutral expression gives your next scan a more useful comparison.",
      },
      {
        id: "capture-baseline",
        guide: {
          title: "Your capture checklist",
          kind: "checklist",
          afterSection: 1,
        },
        title: "Save your baseline",
        minutes: 4,
        intro:
          "Bring light, position and expression together into one setup you can repeat.",
        controls: ["Light", "Position", "Save"],
        captions: [
          "Choose soft light in front of you.",
          "Check eye level, distance and a relaxed face.",
          "Save one clear image as your starting point.",
        ],
        sections: [
          {
            title: "Build a short capture checklist",
            body: "Use one camera and lens, clean the lens, face a soft light source, and keep your head upright. Make sure filters and portrait effects are off. Check that hair, a hand, or a phone case is not covering the part of your face you want to follow.\n\nDo these checks before looking at a score. Otherwise it is easy to keep retaking a photo until the number feels right, which gives you a less useful reference. A baseline should document a repeatable starting setup.",
          },
          {
            title: "Keep one clear starting record",
            body: "Save a clear image with a comfortable expression. Add a short note about the room, camera, and anything unusual, such as different lighting or a recent haircut. You are recording context, not writing a diary.\n\nUse the interactive guide to move through light, position, and saving. For later check-ins, compare against this first record and the most recent comparable one. Keep the original so your reference does not move every time you take a new picture.",
          },
          {
            title: "Know when to start a new baseline",
            body: "A major camera change, a different lens, or an unavoidable new lighting setup may justify a separate reference. Label the change rather than mixing the two setups as though they were identical.\n\nAn older image can remain part of your history without being a fair numerical comparison. The value of the record comes from knowing what stayed the same and what changed around the image.",
          },
        ],
        question: "Which baseline is most useful later?",
        answers: [
          "The photo with the most dramatic shadows",
          "A clear photo with a setup you can recreate",
        ],
        correct: 1,
        explanation:
          "Your baseline becomes useful when later photos use comparable conditions.",
      },
      {
        id: "capture-trends",
        guide: {
          title: "One point becomes a pattern",
          kind: "trend",
          afterSection: 1,
        },
        title: "Read a trend, not a verdict",
        minutes: 4,
        intro: "One image is a starting point. Your history gives it context.",
        controls: ["Baseline", "Check-in", "Trend"],
        captions: [
          "Save your first well-lit scan as a baseline.",
          "Repeat the setup when you choose to check in.",
          "Look across several observations instead of one jump.",
        ],
        sections: [
          {
            title: "Compare like with like",
            body: "Before comparing numbers, compare the photographs. Check light direction, camera height, distance, expression, and whether the same areas are visible. If one photo has strong shadows and the other has even front light, start by explaining that difference.\n\nLook at individual areas as well as the overall estimate. A change in one category does not mean every area changed. The sample chart builds from a baseline to several check-ins. Notice why one extra point gives less context than a series of comparable observations.",
          },
          {
            title: "Read several check-ins together",
            body: "One higher or lower estimate can reflect the image rather than a lasting change. Keep a regular check-in schedule you can maintain and look for patterns across comparable records. Repeated scans taken minutes apart mostly give you more versions of the same moment.\n\nKeep notes factual: a new product, a haircut, a different camera, or an interrupted routine. When a pattern appears, ask which of those changed at the same time. A chart can show that two things happened together; it cannot identify the cause on its own.",
          },
          {
            title: "Turn the review into a next step",
            body: "Choose one practical adjustment after reviewing your history. It may be improving the capture setup, keeping a comfortable routine, or asking a professional about an ongoing concern. Avoid changing several things because of one number.\n\nSave the next check-in under similar conditions. That gives your future review a clearer question to answer: did the observation repeat, and was the comparison fair?",
          },
        ],
        question: "Does one higher score prove your routine worked?",
        answers: [
          "No; review conditions and several scans",
          "Yes; every change is physical progress",
        ],
        correct: 0,
        explanation:
          "A trend is observational. It does not prove that a routine caused a change.",
      },
    ],
  },
  {
    id: "skin",
    publishedAt: "2026-10-20T00:00:00Z",
    title: "The everyday skin routine.",
    subtitle:
      "Build your foundation, protect it, and learn what your skin tolerates.",
    lessons: [
      {
        id: "skin-foundation",
        guide: {
          title: "Give each step a job",
          kind: "routine",
          afterSection: 0,
        },
        title: "Start with a foundation",
        minutes: 4,
        intro:
          "A short routine you can follow is more useful than a shelf full of products.",
        controls: ["Cleanse", "Moisturize", "Protect"],
        captions: [
          "Cleanse gently; avoid scrubbing your skin.",
          "Choose a moisturizer your skin tolerates.",
          "Use broad-spectrum SPF 30 or higher as directed.",
        ],
        sections: [
          {
            title: "Give each basic a job",
            body: "Think of a routine as a few separate jobs: cleaning what needs to come off, keeping dry skin comfortable, and protecting exposed skin outdoors. A longer shelf of products does not automatically make those jobs easier. Choose products you can use consistently and tolerate.\n\nStart by listing what you already use and when. If two products do the same job, you may not need both. Keep prescribed care on the plan you were given instead of replacing it with an app suggestion.",
          },
          {
            title: "Build around comfort",
            body: "A gentle cleanser, a suitable moisturizer, and sun protection can form a simple starting routine. Dryness, stinging, and recurring irritation are useful things to notice; a photo score is not a substitute for them.\n\nUse the three-step guide to review the job of each basic: cleanse, moisturize, and protect. Select a step to see its purpose before deciding whether your routine already covers it. Follow the product label and keep products away from areas the label excludes.",
          },
          {
            title: "Make the routine easy to repeat",
            body: "Put the products you actually use together and connect the routine to an existing moment, such as washing before bed. Keep a brief record of the product names so you can remember what changed later.\n\nIf your current routine is comfortable, you do not need to replace it simply to follow a course. Use the lesson to identify a missing step or an unnecessary duplicate, then make one manageable adjustment.",
          },
        ],
        question: "What makes a good starting routine?",
        answers: [
          "As many active products as possible",
          "A few gentle basics used consistently",
        ],
        correct: 1,
        explanation:
          "A simple foundation makes it easier to notice what your skin tolerates.",
        source: {
          title: "AAD: skin care basics",
          url: "https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget",
        },
      },
      {
        id: "skin-cleanse",
        guide: { title: "A gentler wash", kind: "routine", afterSection: 1 },
        title: "Cleanse without overdoing it",
        minutes: 4,
        intro: "Start the routine with a gentle wash, then keep moisture in.",
        controls: ["Wet", "Cleanse", "Moisturize"],
        captions: [
          "Use lukewarm water rather than very hot water.",
          "Use your fingertips and follow the cleanser label.",
          "Pat dry gently and apply a moisturizer you tolerate.",
        ],
        sections: [
          {
            title: "Clean without scrubbing",
            body: "Wet your face with lukewarm water and use your fingertips to spread a gentle cleanser. Avoid treating a washcloth, brush, or rough scrub as a requirement for a thorough wash. Rinse carefully and pat dry with a soft towel.\n\nThe American Academy of Dermatology advises limiting washing to twice daily and after heavy sweating. More frequent washing is not a shortcut to clearer skin. If your clinician has given different instructions for a condition or treatment, follow those.",
          },
          {
            title: "Notice the result after washing",
            body: "Check how your face feels after the water has dried. Tightness or stinging is a reason to review the product or technique, not a sign that you cleaned especially well. Apply a suitable moisturizer when your skin needs it.\n\nIn the guide, move through wetting, cleansing, and moisturizing. The sequence keeps technique in focus: wet first, cleanse gently, then moisturize as needed. It does not measure changes in pores, oil, or the skin barrier.",
          },
          {
            title: "Change technique before adding more",
            body: "If a wash is uncomfortable, first check water temperature, pressure, frequency, and how much product you use. Keep the rest of your routine stable while making a small adjustment. This makes it easier to understand your own response.\n\nPersistent irritation, a rash, or worsening symptoms deserve professional advice. Do not keep washing or exfoliating harder in an attempt to correct what you see in a photograph.",
          },
        ],
        question: "How should your skin feel after a basic routine?",
        answers: [
          "Scrubbed until it feels tight",
          "Comfortable, without persistent stinging",
        ],
        correct: 1,
        explanation:
          "Gentle cleansing and moisturizing support a routine you can tolerate and repeat.",
        source: {
          title: "AAD: face washing",
          url: "https://www.aad.org/public/everyday-care/skin-care-basics/care/face-washing-101",
        },
      },
      {
        id: "skin-protect",
        guide: {
          title: "Protection, in layers",
          kind: "focus",
          afterSection: 1,
        },
        title: "Make protection a daily step",
        minutes: 4,
        intro: "Complete your daytime basics with a sun-protection plan.",
        controls: ["Shade", "Clothing", "Sunscreen"],
        captions: [
          "Use shade when possible, especially in strong sun.",
          "Use protective clothing, a hat and sunglasses.",
          "Choose broad-spectrum SPF 30 or higher; follow the label.",
        ],
        sections: [
          {
            title: "Plan for the setting",
            body: "Think about where you will spend time outdoors, how long you will be there, and what shade is available. Clothing, a hat, and shade reduce the amount of exposed skin you need to manage. Sunscreen is one part of that plan.\n\nThe American Academy of Dermatology recommends broad-spectrum, water-resistant sunscreen with SPF 30 or higher. Choose a texture you are willing to use and follow the label. An appealing label or a high price does not replace those protection details.",
          },
          {
            title: "Apply with a deliberate check",
            body: "Read the directions for amount and application timing. Check exposed areas that are easy to miss, such as the ears, neck, and the edges of the face. Keep sunscreen away from the eyes as directed.\n\nOutdoors, reapply about every two hours and after swimming or sweating, following the product label. Use the guide to move between shade, clothing, and exposed facial areas. It illustrates the plan; it cannot measure your actual UV exposure or sunscreen coverage.",
          },
          {
            title: "Keep a usable reminder",
            body: "Place your outdoor items where you prepare to leave: sunscreen, hat, and any other protection you use. For a long outing, take what you need for reapplication rather than relying on the morning application.\n\nIf a sunscreen bothers your skin or eyes, look for a tolerable alternative and ask a dermatologist when necessary. Do not intentionally tan or burn to change a scan result.",
          },
        ],
        question: "What belongs in a sun-protection plan?",
        answers: [
          "Shade, protective clothing and sunscreen as directed",
          "Only sunscreen when a scan score drops",
        ],
        correct: 0,
        explanation:
          "Protection is a routine decision, independent of a cosmetic photo estimate.",
        source: {
          title: "AAD: choosing sunscreen",
          url: "https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/choosing-right-sunscreen",
        },
      },
      {
        id: "skin-change",
        guide: {
          title: "One change at a time",
          kind: "timeline",
          afterSection: 1,
        },
        title: "Introduce one change",
        minutes: 4,
        intro: "Make it easier to understand what agrees with your skin.",
        controls: ["Baseline", "One change", "Observe"],
        captions: [
          "Note how your skin feels before changing products.",
          "Introduce one product at a time, following its label.",
          "Pause a product that causes irritation and seek advice when needed.",
        ],
        sections: [
          {
            title: "Give one change a clear purpose",
            body: "Before adding a product, write down what you want it to do and which product already serves that role. Follow the new product’s label instead of assuming that more frequent use will work faster. Keep a prescribed routine separate from experiments.\n\nAdding several products at once makes the result harder to interpret. If your skin becomes uncomfortable, you will have fewer clues about which change mattered. A small, documented change is easier to review and reverse.",
          },
          {
            title: "Test tolerance before routine use",
            body: "The American Academy of Dermatology suggests testing a new skin-care product on a small area before applying it widely. Follow its testing guidance and the product instructions, especially for products that are meant to be rinsed off.\n\nStop using a product if it causes a reaction, and seek appropriate advice for persistent or serious symptoms. The guide’s stages represent the decision process—your existing routine, one change, then observation—not a prediction of how quickly your skin will respond.",
          },
          {
            title: "Record enough to learn from it",
            body: "Save the product name, start date, how often you used it, and whether your skin felt comfortable. Keep your capture setup consistent if you also take check-in photos. These notes are more useful than a long list of ingredients without dates.\n\nReview comfort and visible observations together. A small score movement is not a reason to push through pain or irritation, and a photo cannot tell you whether a treatment is appropriate for you.",
          },
        ],
        question: "Why change one product at a time?",
        answers: [
          "To understand tolerance more clearly",
          "To guarantee a higher scan score",
        ],
        correct: 0,
        explanation:
          "Comfort and tolerance are useful feedback. No product can guarantee a particular scan result.",
        source: {
          title: "AAD: testing skin-care products",
          url: "https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products/",
        },
      },
      {
        id: "skin-track",
        guide: {
          title: "A check-in with context",
          kind: "journal",
          afterSection: 0,
        },
        title: "Make a useful check-in",
        minutes: 4,
        intro: "Pair a consistent photo with what you actually notice.",
        controls: ["Photo", "Routine", "Review"],
        captions: [
          "Use the same soft light for your photo.",
          "Keep a record of the routine you followed.",
          "Review comfort and visible changes together.",
        ],
        sections: [
          {
            title: "Track observations you can describe",
            body: "Choose a small set of things you can notice consistently: comfort after cleansing, recurring dryness, a visible area you are following, or whether you completed your routine. Use plain descriptions rather than trying to diagnose a condition from an image.\n\nA brief note can be enough. Record what you used and any change in the setup around the photo. Do not add measurements that the image or your records cannot actually support.",
          },
          {
            title: "Separate routine activity from outcomes",
            body: "A completed task tells you that you recorded the action. A later photo tells you what was visible under that capture setup. Neither record proves that a particular product caused the change.\n\nThe example keeps a capture note, a routine record, and a comfort observation separate so you can review each without confusing an action with an outcome. Your own Progress page uses saved observations. Compare the dates and the capture conditions before connecting those observations to a routine change.",
          },
          {
            title: "Bring useful records to a professional",
            body: "If a concern persists, organize a short timeline of symptoms, products, and clear photos. This gives a dermatologist more context than a score alone. Mention discomfort and changes you cannot easily see in a picture.\n\nKeep routine records at a frequency that helps you make decisions. Tracking should make your care easier to understand, rather than turning every small day-to-day variation into another change to your routine.",
          },
        ],
        question: "What can a photo-based skin estimate do?",
        answers: [
          "Diagnose a skin condition",
          "Help compare visible cues in similar photos",
        ],
        correct: 1,
        explanation:
          "Photos can help you keep a visual record. Medical concerns need a qualified clinician.",
        source: {
          title: "AAD: finding a dermatologist",
          url: "https://www.aad.org/public/fad",
        },
      },
    ],
  },
  {
    id: "style",
    publishedAt: "2026-10-20T00:00:00Z",
    title: "Grooming, considered.",
    subtitle:
      "Understand your frame. Choose your details. Make the routine yours.",
    lessons: [
      {
        id: "style-frame",
        guide: { title: "Find your frame", kind: "focus", afterSection: 0 },
        title: "Understand your frame",
        minutes: 4,
        intro:
          "Your hair and grooming frame your features. Explore options without chasing a ranking.",
        controls: ["Hair", "Brows", "Outline"],
        captions: [
          "Notice how hair frames your forehead and temples.",
          "Use the eye line to understand your natural brow position.",
          "Look at the whole outline instead of one isolated feature.",
        ],
        sections: [
          {
            title: "Decide what you want to emphasize",
            body: "Start with a preference you can describe: a softer outline, less height at the front, more visible brows, or hair that stays away from your eyes. These are styling choices, not rules about correcting your face.\n\nLook at the whole frame around your face before changing a single feature. Hair volume, a part, and facial hair can affect the visible outline. Use the guide to compare regions of the same photograph while keeping the person and lighting fixed.",
          },
          {
            title: "Use a reference as a conversation",
            body: "Choose a few references that share your hair texture and roughly the amount of hair or facial hair you have. Identify the element you like rather than asking for an exact copy of someone else’s appearance.\n\nTell a barber or stylist how much time you want to spend each day and which tools you already use. Ask what the choice looks like without studio lighting or a long styling session. That makes the plan easier to live with.",
          },
          {
            title: "Try a reversible adjustment",
            body: "Before a major cut, try a different part, a small change in volume, or moving hair away from the face. Photograph the options under the same conditions if comparison helps you choose.\n\nNotice comfort, upkeep, and your own preference. A style does not need to raise a score to be a good choice for you. Keep the version you want to wear and can reasonably maintain.",
          },
        ],
        question: "What should guide a styling choice?",
        answers: [
          "Your preferences, hair, and upkeep",
          "A promise to change your bone structure",
        ],
        correct: 0,
        explanation:
          "Styling changes presentation. It does not alter facial bone structure.",
      },
      {
        id: "style-hair",
        guide: {
          title: "Your haircut brief",
          kind: "journal",
          afterSection: 1,
        },
        title: "Choose a haircut you can maintain",
        minutes: 4,
        intro:
          "Translate the frame you noticed into a practical conversation with your barber.",
        controls: ["Texture", "Reference", "Upkeep"],
        captions: [
          "Start with your natural texture and growth pattern.",
          "Bring a few examples, including views from the side.",
          "Choose a finish you can recreate at home.",
        ],
        sections: [
          {
            title: "Work with texture and growth",
            body: "Notice where your hair naturally parts, which areas lift, and which areas lie flat. These details affect how much work a style takes. A picture of straight hair may not explain how the same silhouette behaves with curls or coils.\n\nSave references with a similar texture and separate the cut from the styling. Ask which parts need drying, a particular brush, or product. Knowing that before a cut prevents a polished reference from becoming an impractical daily routine.",
          },
          {
            title: "Describe the everyday version",
            body: "Decide how long you want to spend getting ready and whether you prefer a style that air-dries. Explain the environments it needs to work in, such as a helmet, exercise, or a workplace dress code.\n\nUse the haircut brief to prepare three parts of the conversation: your natural texture, a useful reference, and the upkeep you can manage. It is a prompt for your barber, not a simulation of how a haircut will look on you.",
          },
          {
            title: "Leave with clear maintenance steps",
            body: "Ask your barber or stylist to demonstrate the order of the steps, the tool, and an approximate amount of styling product. Take a short note while the process is fresh. Start with less product and follow its instructions.\n\nCheck whether the style stays comfortable through the day. If you are repeatedly fixing it or pulling at the hair, ask for a simpler adjustment rather than adding more steps indefinitely.",
          },
        ],
        question: "Which question helps you choose a realistic haircut?",
        answers: [
          "How do I recreate this with my hair and time?",
          "Which haircut guarantees a higher face score?",
        ],
        correct: 0,
        explanation:
          "A good reference starts a conversation about your hair and everyday upkeep.",
      },
      {
        id: "style-brows",
        guide: {
          title: "Keep the natural outline",
          kind: "focus",
          afterSection: 0,
        },
        title: "Keep the natural brow",
        minutes: 4,
        intro:
          "A few restrained details can keep brows tidy without chasing a new shape.",
        controls: ["Observe", "Brush", "Keep"],
        captions: [
          "Notice the natural start, arch and tail.",
          "Brush gently in the direction the hair grows.",
          "Keep the shape you have; avoid aggressive plucking.",
        ],
        sections: [
          {
            title: "Look before removing anything",
            body: "Brush your brows into a comfortable position and observe the direction of the hairs. Small differences between the two sides are normal. A face overlay can help you see the region, but it is not a stencil for making the brows identical.\n\nWork in ordinary light and take breaks from close inspection. A magnified view can make a small detail seem more important than it appears in normal conversation.",
          },
          {
            title: "Keep changes conservative",
            body: "Begin with brushing rather than removing hair. If you want a shape change, describe the result to a qualified professional and ask what can be done without over-thinning. Avoid improvising a sharp outline from an overlay.\n\nThe guide keeps the photograph fixed while highlighting the brow and eye region. It shows where to look, not where you should cut or pluck. Do not bring sharp tools close to the eye to copy a diagram.",
          },
          {
            title: "Review at normal distance",
            body: "Step back after any grooming and look at the full face, rather than alternating between individual hairs. If you take comparison photos, use the same light and distance.\n\nGive yourself time before making another removal decision. A light-touch approach is easier to adjust later than repeatedly changing the outline in one session.",
          },
        ],
        question: "What is a sensible first step?",
        answers: [
          "Remove a lot of hair to make both brows identical",
          "Observe the natural shape and brush gently",
        ],
        correct: 1,
        explanation:
          "A conservative approach makes it easier to preserve your natural frame.",
      },
      {
        id: "style-groom",
        guide: {
          title: "Three finishing touches",
          kind: "focus",
          afterSection: 1,
        },
        title: "Keep grooming intentional",
        minutes: 4,
        intro:
          "Small, comfortable details can make a routine easier to maintain.",
        controls: ["Hair", "Brows", "Beard"],
        captions: [
          "Choose an easy-to-repeat hair routine.",
          "Keep your natural brow shape; avoid over-plucking.",
          "If you shave, use gentle technique and clean tools.",
        ],
        sections: [
          {
            title: "Choose a manageable outline",
            body: "Think about which grooming tasks you actually want to maintain: keeping hair clear of the eyes, brushing brows, or maintaining a comfortable facial-hair length. Choose a small number rather than treating every area as a project.\n\nUse a mirror and ordinary lighting to identify your preference. The guide highlights hair, brows, and the lower face separately. Its lines describe regions of the photograph; they are not instructions to change your bone structure or skin.",
          },
          {
            title: "Ask to see the technique",
            body: "A barber can show how to maintain a chosen length, follow the natural growth, and use the correct guard for your tool. Ask where to stop and which areas should be left alone. Keep the tool’s own cleaning and use instructions.\n\nIf shaving or grooming repeatedly leaves your skin uncomfortable, review the technique and seek suitable advice. Do not keep going over the same area just to match a very sharp reference image.",
          },
          {
            title: "Build a small maintenance kit",
            body: "Keep only the tools you understand how to use and the products you tolerate. Put them together, clean them as directed, and replace worn parts according to the manufacturer’s guidance.\n\nTake a normal-distance photo of a result you like and make a short note of the tool or guard used. That gives your next grooming session a practical reference without requiring you to recreate a dramatic studio image.",
          },
        ],
        question: "Should a grooming step hurt?",
        answers: [
          "Yes, if it promises fast results",
          "No; stop a step that causes pain",
        ],
        correct: 1,
        explanation:
          "Pain is a reason to stop and reassess, not a measure of progress.",
      },
      {
        id: "style-routine",
        guide: {
          title: "Make room for one habit",
          kind: "timeline",
          afterSection: 1,
        },
        title: "Make it your routine",
        minutes: 4,
        intro: "Choose one small action you can carry into the coming week.",
        controls: ["Choose", "Repeat", "Reflect"],
        captions: [
          "Choose one manageable grooming habit.",
          "Repeat it at a time that fits your day.",
          "Keep it if it feels useful; adjust if it does not.",
        ],
        sections: [
          {
            title: "Name one action and one moment",
            body: "Replace a broad intention such as “improve my grooming” with an action you can finish: brush your brows after getting dressed, prepare tomorrow’s products after washing, or book a haircut when your preferred shape becomes difficult to maintain.\n\nPick a moment that already happens in your day. Keep the action short enough that you can do it on an ordinary busy day, not just when you have extra time.",
          },
          {
            title: "Use completion as a record",
            body: "Mark a task after doing it. If you skip it, leave the record as it is instead of filling in a perfect streak. Honest records help you understand which parts of a routine fit your life.\n\nThe guide moves through choosing, repeating, and reviewing an action. Select a stage to review the decision you need to make. Repeating an action records consistency; it does not guarantee a physical result.",
          },
          {
            title: "Review and simplify",
            body: "After you have tried the action in your normal schedule, ask whether it was comfortable, useful, and easy to repeat. If it was too involved, shorten it or choose a better moment. A routine can improve by having fewer steps.\n\nKeep the part that works and change one obstacle at a time. Your completion history and later observations provide context for that review, while your own preferences decide what is worth continuing.",
          },
        ],
        question: "What makes a habit easier to maintain?",
        answers: [
          "A small action tied to a regular moment",
          "Changing every part of your routine at once",
        ],
        correct: 0,
        explanation:
          "A specific, manageable action is easier to repeat and adjust.",
      },
    ],
  },
];

export function courseProgress(course: Course, completed: string[]) {
  const count = course.lessons.filter((lesson) =>
    completed.includes(lesson.id),
  ).length;
  return {
    count,
    total: course.lessons.length,
    fraction: count / course.lessons.length,
    next: course.lessons.findIndex((lesson) => !completed.includes(lesson.id)),
  };
}

export function coursePublicationAge(publishedAt: string, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - Date.parse(publishedAt)) / 86_400_000));
  if (days === 0) return "Today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}m ago`;
}
