import type { Drill } from "./types";

// Starter drill library, seeded into storage on first run. All age-appropriate
// for U9s: short blocks, maximum touches, no negative framing.
export const SEED_DRILLS: Drill[] = [
  {
    id: "seed-stuck-in-the-mud",
    name: "Stuck in the Mud",
    tags: ["warmup", "fun", "evasion"],
    durationMins: 5,
    equipment: "Cones for a square",
    description:
      "Two taggers. Tagged players freeze with arms out and are freed when a teammate crawls under or gives a high five. Swap taggers every minute.",
  },
  {
    id: "seed-rob-the-nest",
    name: "Rob the Nest",
    tags: ["warmup", "fun", "fitness"],
    durationMins: 8,
    equipment: "4 hoops or cone circles, 12+ balls",
    description:
      "Teams in each corner sprint to the middle nest, carry one ball back at a time, then raid other nests. Most balls when the whistle goes wins. No guarding your own nest.",
  },
  {
    id: "seed-follow-the-leader",
    name: "Follow the Leader",
    tags: ["warmup", "fitness"],
    durationMins: 5,
    equipment: "None",
    description:
      "Pairs jog anywhere inside the square; the front player mixes in side-steps, hops and changes of pace, partner copies. Swap on the whistle.",
  },
  {
    id: "seed-octopus-tag",
    name: "Octopus Tag",
    tags: ["warmup", "evasion", "fun"],
    durationMins: 6,
    equipment: "Cones for a channel",
    description:
      "Everyone runs the channel; the octopus in the middle tags runners, who become seaweed — feet planted, arms waving, helping tag. Last runner free starts as the next octopus.",
  },
  {
    id: "seed-passing-lines",
    name: "Passing Lines",
    tags: ["passing"],
    durationMins: 8,
    equipment: "1 ball per group of 4, cones",
    description:
      "Groups of four jog the channel passing left to right along the line, then back the other way on the return trip. Hands up as a target, pass to the space in front of the catcher.",
  },
  {
    id: "seed-pass-and-follow",
    name: "Pass and Follow",
    tags: ["passing", "fitness"],
    durationMins: 6,
    equipment: "1 ball, cones in a square",
    description:
      "Players on each corner cone. Pass across the square, then follow your pass to join the back of that queue. Add a second ball once it flows.",
  },
  {
    id: "seed-piggy-in-the-middle",
    name: "Piggy in the Middle",
    tags: ["passing", "fun"],
    durationMins: 6,
    equipment: "1 ball per group of 5, cones",
    description:
      "Four passers around a small square keep the ball away from one piggy. Piggy swaps with whoever throws an intercepted or dropped pass. Count consecutive passes out loud.",
  },
  {
    id: "seed-2v1-draw-and-pass",
    name: "2 v 1 Draw and Pass",
    tags: ["passing", "evasion"],
    durationMins: 10,
    equipment: "Balls, cones for a narrow channel",
    description:
      "Two attackers against one defender in a short channel. Ball carrier runs straight, draws the defender, passes just before contact. Celebrate the assist as much as the try.",
  },
  {
    id: "seed-pass-relay",
    name: "Pass Relay Races",
    tags: ["passing", "fitness", "fun"],
    durationMins: 6,
    equipment: "1 ball per team, cones",
    description:
      "Teams in single file. Run to the far cone and back, pop the ball to the next runner. First team seated with the ball wins. Race again with weaker-hand carries.",
  },
  {
    id: "seed-tackle-bag-technique",
    name: "Tackle Bag Basics",
    tags: ["tackling"],
    durationMins: 10,
    equipment: "Tackle bags or shields",
    description:
      "Cheek to cheek, arms wrap, drive with the legs. Start kneeling beside the bag, then from standing, then a three-step approach. Lots of reps, lots of praise for good shape.",
  },
  {
    id: "seed-knee-tag",
    name: "Knee Tag",
    tags: ["tackling", "warmup", "fun"],
    durationMins: 5,
    equipment: "None",
    description:
      "Pairs face off in a small grid, trying to touch each other's knees while protecting their own. Low body height, eyes up, small steps — the tackle position without contact.",
  },
  {
    id: "seed-kneeling-tackles",
    name: "Kneeling Tackle Progression",
    tags: ["tackling"],
    durationMins: 10,
    equipment: "Soft ground or mats if available",
    description:
      "Tackler kneels, ball carrier walks past; wrap and roll together. Progress to tackler crouching and carrier jogging. Keep it slow, reward technique over force.",
  },
  {
    id: "seed-bulldog",
    name: "Roodog Bulldog",
    tags: ["tackling", "evasion", "fun"],
    durationMins: 8,
    equipment: "Cones for a wide channel",
    description:
      "Runners cross the channel; bulldogs tackle (or two-hand touch, your call on the day) to recruit more bulldogs. Match tackle rules to what you've trained so far.",
  },
  {
    id: "seed-evasion-channel",
    name: "1 v 1 Evasion Channel",
    tags: ["evasion"],
    durationMins: 8,
    equipment: "Balls, cones for narrow channels",
    description:
      "One attacker, one defender, a two-metre channel. Attacker has three seconds to beat the defender to the line with footwork only — no fends. Swap roles each go.",
  },
  {
    id: "seed-footwork-ladders",
    name: "Fast Feet and Side-step",
    tags: ["evasion", "fitness"],
    durationMins: 6,
    equipment: "Agility ladder or flat cones",
    description:
      "Quick feet through the ladder, then plant and side-step off a cone at the end, finishing with a swerve to score. Both feet — everyone loves the goose-step round.",
  },
  {
    id: "seed-traffic-lights",
    name: "Traffic Lights",
    tags: ["evasion", "warmup", "fun"],
    durationMins: 5,
    equipment: "1 ball each if possible",
    description:
      "Ball in two hands, jogging anywhere. Green = run, amber = side-step anyone near you, red = stop dead and ball up. Add your own calls — 'seagull' is a favourite.",
  },
  {
    id: "seed-corner-ball",
    name: "Corner Ball",
    tags: ["evasion", "fun"],
    durationMins: 8,
    equipment: "1 ball, cones for a square",
    description:
      "Attackers score by grounding the ball in any corner; defenders can only two-hand touch. Attackers keep the ball moving to find the empty corner. Rotate teams often.",
  },
  {
    id: "seed-ruck-body-position",
    name: "Over-the-Ball Body Shape",
    tags: ["rucking"],
    durationMins: 8,
    equipment: "Balls, shields",
    description:
      "Carrier goes to ground and presents long; next player steps over in a strong crouch — flat back, wide base, eyes up — and holds against a gentle shield push.",
  },
  {
    id: "seed-2v1-ruck-race",
    name: "2 v 1 Ruck Race",
    tags: ["rucking", "fitness"],
    durationMins: 8,
    equipment: "Balls, shields, cones",
    description:
      "Ball on the ground mid-channel. Two supporters race in to secure it over a shield-holder before the defender arrives. First there in good shape keeps the ball.",
  },
  {
    id: "seed-present-and-sweep",
    name: "Tackle, Present, Sweep",
    tags: ["rucking", "tackling"],
    durationMins: 10,
    equipment: "Tackle bags, balls",
    description:
      "Mini sequence: safe tackle on the bag, carrier presents the ball back, first teammate steps over, second sweeps it away and passes. Walk it through, then half pace.",
  },
  {
    id: "seed-shuttle-relays",
    name: "Try-Line Shuttles",
    tags: ["fitness", "fun"],
    durationMins: 6,
    equipment: "Balls, cones",
    description:
      "Short shuttle runs finishing with a dive-free try under the posts each length. Race in teams so the running hides inside the game.",
  },
  {
    id: "seed-rugby-netball",
    name: "Rugby Netball",
    tags: ["fun", "passing"],
    durationMins: 10,
    equipment: "1 ball, cones or bibs",
    description:
      "Any-direction passing, no running with the ball, score by catching it over the try line. Great for support lines and calling for the ball. Defenders two-hand touch only.",
  },
  {
    id: "seed-crocodile-crossing",
    name: "Crocodile Crossing",
    tags: ["fun", "evasion"],
    durationMins: 6,
    equipment: "Cones for a river channel",
    description:
      "Two crocodiles crawl (knees down) in the river; players carry balls across without being tagged. Tagged players do five star jumps on the bank and rejoin.",
  },
  {
    id: "seed-golden-try",
    name: "Golden Try Game",
    tags: ["fun"],
    durationMins: 10,
    equipment: "1 ball, bibs, cones for a small pitch",
    description:
      "Small-sided game to finish training — next try wins, winners choose the celebration. Use whatever contact rules you trained today. End on a high, every time.",
  },
  {
    id: "seed-catch-above-head",
    name: "High Five Catches",
    tags: ["passing", "warmup"],
    durationMins: 5,
    equipment: "1 ball per pair",
    description:
      "Pairs throw catchable high balls to each other, calling 'mine' with early hands up. Three in a row earns a double high five. Build to a gentle jog while catching.",
  },
];
