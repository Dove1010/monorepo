export enum PartnerLandlordApplicationStatus {
  PENDING = "pending",
}

export interface PartnerLandlordApplication {
  applicationId: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  propertyCount: number;
  propertyLocations: string;
  status: PartnerLandlordApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartnerLandlordApplicationData {
  fullName: string;
  phoneNumber: string;
  email: string;
  propertyCount: number;
  propertyLocations: string;
}
