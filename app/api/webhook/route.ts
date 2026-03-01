import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook handler for Base Mini App events.
 * Currently handles event notifications from the MiniKit framework.
 * Extend as needed for analytics, notifications, etc.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log("[Webhook] Received event:", JSON.stringify(body));

        // Handle different webhook event types
        const { type } = body;

        switch (type) {
            case "frame_added":
                // User added the mini app
                console.log("[Webhook] Mini app added by user");
                break;
            case "frame_removed":
                // User removed the mini app
                console.log("[Webhook] Mini app removed by user");
                break;
            case "notifications_enabled":
                // User enabled notifications
                console.log("[Webhook] Notifications enabled");
                break;
            case "notifications_disabled":
                // User disabled notifications
                console.log("[Webhook] Notifications disabled");
                break;
            default:
                console.log(`[Webhook] Unknown event type: ${type}`);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Webhook] Error processing webhook:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
