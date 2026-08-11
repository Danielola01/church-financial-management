import { UserProfile } from "./types";

export function getOrgInitials(organizationName?: string): string {
  if (!organizationName || !organizationName.trim()) return "C";
  return organizationName.trim().charAt(0).toUpperCase();
}

export function getOrgAcronym(organizationName?: string): string {
  if (!organizationName || !organizationName.trim()) return "CRACI";
  const words = organizationName.trim().split(/\s+/);
  return words.map((w) => w.charAt(0)).join("").toUpperCase();
}

// Known canonical categories and common typos / alternative spellings
const CANONICAL_DICTIONARY: { canonical: string; keywords: string[] }[] = [
  {
    canonical: "Evangelism",
    keywords: ["evangelism", "evanglism", "evangilism", "evangalism", "evangelisation", "evangelization", "evangelist", "evangelistic"]
  },
  {
    canonical: "Tithe",
    keywords: ["tithe", "tithes", "thithe", "thithes", "tithing", "tithe offering", "tithes offering"]
  },
  {
    canonical: "Sunday Collection",
    keywords: ["sunday collection", "sunday collections", "sunday collectio", "sunday offertory", "sunday offering", "sunday offer", "sunday coll"]
  },
  {
    canonical: "Donation",
    keywords: ["donation", "donations", "donatio", "donations ", "free donation", "donations & vows"]
  },
  {
    canonical: "Thanksgiving",
    keywords: ["thanksgiving", "thanksgivng", "thanks giving", "thanks givings", "thansgiving", "thanksgving", "thanksgiving offering"]
  },
  {
    canonical: "Building Fund",
    keywords: ["building fund", "building funds", "building project", "building", "bilding fund", "church building"]
  },
  {
    canonical: "Special Seed",
    keywords: ["special seed", "special seeds", "seed offering", "seed", "seeds"]
  },
  {
    canonical: "Offertory",
    keywords: ["offertory", "offertori", "offering", "offerings", "weekly offering", "mass offering"]
  },
  {
    canonical: "Harvest",
    keywords: ["harvest", "harvest thanksgiving", "harvest & bazaar", "harvest and bazaar", "annual harvest"]
  },
  {
    canonical: "Idupe Miran",
    keywords: ["idupe miran", "idupe", "idupemiran", "idupe-miran", "idupe_miran"]
  },
  {
    canonical: "Electricity",
    keywords: ["electricity", "electric", "nepa", "phcn", "power", "electrikity", "light bill", "power bill"]
  },
  {
    canonical: "Welfare",
    keywords: ["welfare", "wel fare", "wellfare", "welfar", "welfare package"]
  },
  {
    canonical: "Rent",
    keywords: ["rent", "lease", "hall rent", "venue rent"]
  },
  {
    canonical: "Equipment",
    keywords: ["equipment", "equipments", "eqipment", "sound system", "musical equipment", "instruments"]
  },
  {
    canonical: "Transport",
    keywords: ["transport", "transportation", "fuel", "diesel", "petrol", "logistics", "travel"]
  },
  {
    canonical: "Honorarium",
    keywords: ["honorarium", "honoraerium", "honourarium", "honoraria", "ministers honorarium", "honorary"]
  },
  {
    canonical: "Repairs",
    keywords: ["repairs", "repair", "maintenance", "servicing", "renovation", "fixing"]
  },
  {
    canonical: "Water",
    keywords: ["water", "water bill", "borehole", "water supply"]
  }
];

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Normalizes category names to fix typographical errors and combine variants
 * (e.g. "Evanglism", "Evangelism ", "evangelism") into a single canonical name.
 */
export function normalizeCategory(input: string): string {
  if (!input) return "";
  const cleaned = input.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  const lower = cleaned.toLowerCase().replace(/['".,]/g, "");

  // 1. Direct dictionary match
  for (const entry of CANONICAL_DICTIONARY) {
    if (entry.keywords.some((kw) => kw.toLowerCase() === lower)) {
      return entry.canonical;
    }
  }

  // 2. Fuzzy match via Levenshtein distance
  for (const entry of CANONICAL_DICTIONARY) {
    for (const kw of entry.keywords) {
      const dist = levenshteinDistance(lower, kw);
      const maxAllowedDist = kw.length <= 5 ? 1 : 2;
      if (dist <= maxAllowedDist) {
        return entry.canonical;
      }
    }
  }

  // 3. Title Case formatting for unrecognized categories
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Returns a highly-readable, tailored title/role name for specific users
 * or standard capitalized role names for others.
 */
export function getUserRoleDisplay(profile: UserProfile | null): string {
  if (!profile) return "Treasurer";
  
  // Specific roles for designated leaders
  if (profile.email === "ogundedanielola@gmail.com") {
    return "Reverend";
  }
  if (profile.email === "demotest@gmail.com") {
    return "Chairman";
  }
  
  // Custom Display logic if they are individual owners vs organization admins
  if (profile.role === "admin") {
    if (profile.organizationType === "individual") {
      return "Owner";
    }
    return "Admin";
  }
  
  // Otherwise capitalize standard roles
  const r = profile.role || "treasurer";
  return r.charAt(0).toUpperCase() + r.slice(1);
}
