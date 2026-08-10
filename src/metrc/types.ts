/**
 * Partial typings for METRC responses.
 *
 * These deliberately cover the fields an operator actually reads day to
 * day rather than mirroring the full payloads, which vary slightly by
 * state and API version. Unknown fields pass through untouched because
 * tool handlers serialize the raw objects; the types exist so the
 * summarization helpers are checked by the compiler.
 */

export interface Facility {
  License: { Number: string; LicenseType: string };
  Name: string;
  DisplayName: string;
}

export interface MetrcPackage {
  Id: number;
  Label: string;
  Quantity: number;
  UnitOfMeasureName: string;
  Item: { Name: string; ProductCategoryName: string };
  PackagedDate: string;
  LabTestingState: string;
  IsFinished: boolean;
  IsOnHold: boolean;
}

export interface Item {
  Id: number;
  Name: string;
  ProductCategoryName: string;
  UnitOfMeasureName: string;
  IsUsed: boolean;
}

export interface Transfer {
  Id: number;
  ManifestNumber: string;
  ShipperFacilityLicenseNumber: string;
  ShipperFacilityName: string;
  RecipientFacilityLicenseNumber?: string;
  RecipientFacilityName?: string;
  CreatedDateTime: string;
  PackageCount: number;
  DeliveryCount?: number;
}

export interface LabTestResult {
  PackageId: number;
  LabTestResultId: number;
  LabFacilityName: string;
  TestTypeName: string;
  TestPassed: boolean;
  TestResultLevel: number;
  TestPerformedDate: string;
}
