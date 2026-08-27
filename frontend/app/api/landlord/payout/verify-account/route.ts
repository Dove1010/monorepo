import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bankName, accountNumber } = body;

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Basic validation
    if (!bankName || !accountNumber) {
      return NextResponse.json(
        { error: "Bank name and account number are required" },
        { status: 400 }
      );
    }

    if (accountNumber.length < 10) {
      return NextResponse.json(
        { error: "Invalid account number length" },
        { status: 400 }
      );
    }

    // Mock response
    return NextResponse.json({
      accountName: "JOHN DOE",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to verify account" },
      { status: 500 }
    );
  }
}
