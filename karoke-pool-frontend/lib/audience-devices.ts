export function audienceDevices<T extends Pick<MediaDeviceInfo, "deviceId" | "kind" | "groupId">>(devices: T[]) {
  const defaultGroup = devices.find(device => device.kind === "audiooutput" && device.deviceId === "default")?.groupId;
  return devices.filter(device => device.kind === "audiooutput" && device.deviceId && device.deviceId !== "default" && device.deviceId !== "communications" && (!defaultGroup || device.groupId !== defaultGroup));
}
