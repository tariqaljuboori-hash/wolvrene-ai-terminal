import { NextResponse } from "next/server";

type WhopMember = {
  id?: string;
  access_level?: string;
  status?: string;
  most_recent_action?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    username?: string;
  };
};

type WhopMembership = {
  id?: string;
  status?: string;
  manage_url?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    username?: string;
  };
  product?: {
    id?: string;
    title?: string;
  };
  plan?: {
    id?: string;
  };
};

const OWNER_EMAIL = (process.env.WOLVRENE_OWNER_EMAIL || "tariq.aljuboori@gmail.com")
  .toLowerCase()
  .trim();

const ACTIVE_MEMBER_ACTIONS = new Set([
  "paid_subscriber",
  "paid_once",
  "trialing",
  "renewing",
  "joined",
]);

const ACTIVE_MEMBERSHIP_STATUSES = new Set(["active", "trialing"]);

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

async function whopGet(path: string, params: Record<string, string | undefined>) {
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) {
    throw new Error("Missing WHOP_API_KEY in .env.local");
  }

  const url = new URL(`https://api.whop.com/api/v5/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
    };
  }

  return {
    ok: true,
    status: res.status,
    data,
  };
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const cleanEmail = String(email || "").toLowerCase().trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return json(400, {
        active: false,
        role: "none",
        message: "Enter a valid email.",
      });
    }

    if (cleanEmail === OWNER_EMAIL) {
      return json(200, {
        active: true,
        role: "owner",
        message: "Owner access granted.",
      });
    }

    const companyId = process.env.WHOP_COMPANY_ID;
    const productIds = process.env.WHOP_PRODUCT_IDS;
    const planIds = process.env.WHOP_PLAN_IDS;

    const membersResponse = await whopGet("members", {
      first: "10",
      query: cleanEmail,
      company_id: companyId,
      access_level: "customer",
      product_ids: productIds,
      plan_ids: planIds,
    });

    if (!membersResponse.ok) {
      return json(500, {
        active: false,
        role: "none",
        message: "Whop member check failed.",
        details: membersResponse.data,
      });
    }

    const members: WhopMember[] = Array.isArray(membersResponse.data?.data)
      ? membersResponse.data.data
      : [];

    const matchingMember = members.find((member) => {
      const memberEmail = String(member?.user?.email || "").toLowerCase().trim();
      return memberEmail === cleanEmail;
    });

    const memberHasAccess = Boolean(
      matchingMember &&
        matchingMember.access_level === "customer" &&
        matchingMember.status === "joined" &&
        ACTIVE_MEMBER_ACTIONS.has(String(matchingMember.most_recent_action || ""))
    );

    if (memberHasAccess) {
      return json(200, {
        active: true,
        role: "vip",
        source: "whop_member",
        memberId: matchingMember?.id,
        message: "VIP access granted.",
      });
    }

    const membershipsResponse = await whopGet("memberships", {
      first: "25",
      company_id: companyId,
      product_ids: productIds,
      plan_ids: planIds,
      statuses: "active,trialing",
    });

    if (!membershipsResponse.ok) {
      return json(200, {
        active: false,
        role: "none",
        message: "No active VIP subscription found.",
      });
    }

    const memberships: WhopMembership[] = Array.isArray(membershipsResponse.data?.data)
      ? membershipsResponse.data.data
      : [];

    const matchingMembership = memberships.find((membership) => {
      const membershipEmail = String(membership?.user?.email || "").toLowerCase().trim();
      return (
        membershipEmail === cleanEmail &&
        ACTIVE_MEMBERSHIP_STATUSES.has(String(membership.status || ""))
      );
    });

    if (matchingMembership) {
      return json(200, {
        active: true,
        role: "vip",
        source: "whop_membership",
        membershipId: matchingMembership.id,
        manageUrl: matchingMembership.manage_url,
        message: "VIP access granted.",
      });
    }

    return json(200, {
      active: false,
      role: "none",
      message: "No active VIP subscription found for this email.",
    });
  } catch (error) {
    return json(500, {
      active: false,
      role: "none",
      message: error instanceof Error ? error.message : "Access check failed.",
    });
  }
}
