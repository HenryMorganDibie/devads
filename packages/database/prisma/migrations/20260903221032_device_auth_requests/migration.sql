-- CreateEnum
CREATE TYPE "DeviceAuthStatus" AS ENUM ('PENDING', 'APPROVED', 'EXPIRED');

-- CreateTable
CREATE TABLE "device_auth_requests" (
    "id" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "status" "DeviceAuthStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "platform" TEXT,
    "extensionVersion" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "device_auth_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_auth_requests_deviceCode_key" ON "device_auth_requests"("deviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "device_auth_requests_userCode_key" ON "device_auth_requests"("userCode");

-- CreateIndex
CREATE INDEX "device_auth_requests_status_idx" ON "device_auth_requests"("status");
