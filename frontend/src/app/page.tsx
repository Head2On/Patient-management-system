"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, Plus, Search } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                CareDesk Design System
              </h1>
              <p className="text-sm text-muted-foreground">
                Neutral light theme · Soft grey surfaces · Muted green (#39836D) accents
              </p>
            </div>
          </div>
        </div>

        {/* Status Badges Showcase */}
        <Card>
          <CardHeader>
            <CardTitle>Restrained Status Badges</CardTitle>
            <CardDescription>
              Status indicators designed for clinical workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="default">Primary (#39836D)</Badge>
            <Badge variant="success">Active / Confirmed</Badge>
            <Badge variant="info">Scheduled</Badge>
            <Badge variant="warning">In Progress</Badge>
            <Badge variant="destructive">Cancelled / Inactive</Badge>
            <Badge variant="secondary">Receptionist</Badge>
            <Badge variant="outline">Doctor</Badge>
          </CardContent>
        </Card>

        {/* Buttons Showcase */}
        <Card>
          <CardHeader>
            <CardTitle>Button Hierarchy</CardTitle>
            <CardDescription>
              One clear primary action per page with consistent sizes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="default">
              <Plus className="h-4 w-4" />
              New Patient
            </Button>
            <Button variant="secondary">Secondary Action</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Deactivate</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="link">View Records</Button>
          </CardContent>
        </Card>

        {/* Form Controls Showcase */}
        <Card>
          <CardHeader>
            <CardTitle>Form Elements</CardTitle>
            <CardDescription>
              Labels strictly placed above inputs with clear focus indicators.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" placeholder="e.g. 9876543210" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patient-no">Patient Number</Label>
              <Input id="patient-no" placeholder="PDC-000001" disabled />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              Form inputs with subtle borders and 8px radii.
            </span>
            <Button size="sm">Save Entry</Button>
          </CardFooter>
        </Card>

        {/* Compact Table Showcase */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Compact Patient Directory Table</CardTitle>
              <CardDescription>
                Clean, readable columns with compact rows.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-8 h-8 text-xs" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Patient No.</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-xs">PDC-000001</TableCell>
                  <TableCell className="font-medium">Aarav Patel</TableCell>
                  <TableCell className="text-muted-foreground">9876543210</TableCell>
                  <TableCell>
                    <Badge variant="success">Active</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">PDC-000002</TableCell>
                  <TableCell className="font-medium">Priya Sharma</TableCell>
                  <TableCell className="text-muted-foreground">9823456789</TableCell>
                  <TableCell>
                    <Badge variant="warning">Checked In</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Accessible Dialog Showcase */}
        <Card>
          <CardHeader>
            <CardTitle>Accessible Dialog</CardTitle>
            <CardDescription>
              Modal confirmation for sensitive or destructive clinical actions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open Confirmation Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Deactivate Patient Record?</DialogTitle>
                  <DialogDescription>
                    This will soft-delete the record for PDC-000001. The patient
                    will not be available for new appointments until reactivated.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline">Cancel</Button>
                  <Button variant="destructive">Confirm Deactivation</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
