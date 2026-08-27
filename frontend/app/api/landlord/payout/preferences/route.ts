import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simply echo back the saved preferences as a mock success response
    return NextResponse.json({
      success: true,
      preferences: body,
      message: "Payout preferences updated successfully"
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
