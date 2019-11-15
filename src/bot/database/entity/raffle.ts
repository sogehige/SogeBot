import { Column, Entity, Index, ManyToOne,OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from './_transformer';

@Entity()
export class Raffle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column('text',{ nullable: true })
  winner!: string | null;
  @Column('bigint', { transformer: new ColumnNumericTransformer(), default: 0 })
  timestamp!: number;
  @Column()
  @Index()
  keyword!: string;
  @Column('bigint', { transformer: new ColumnNumericTransformer(), default: 0 })
  minTickets!: number;
  @Column('bigint', { transformer: new ColumnNumericTransformer(), default: 0 })
  maxTickets!: number;
  @Column()
  type!: number;
  @Column()
  forFollowers!: boolean;
  @Column()
  forSubscribers!: boolean;
  @Column({ default: false })
  isClosed!: boolean;
  @OneToMany(() => RaffleParticipant, (p) => p.raffle, {
    cascade: true,
  })
  participants!: RaffleParticipant[];
};

@Entity()
export class RaffleParticipant {
  @PrimaryGeneratedColumn()
  id!: number;
  @ManyToOne(() => Raffle, (r) => r.participants, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  raffle!: Raffle;
  @Column()
  username!: string;
  @Column()
  tickets!: number;
  @Column()
  isEligible!: boolean;
  @Column()
  isFollower!: boolean;
  @Column()
  isSubscriber!: boolean;
  @OneToMany(() => RaffleParticipantMessage, (p) => p.participant, {
    cascade: true,
  })
  messages!: RaffleParticipantMessage[];
};

@Entity()
export class RaffleParticipantMessage {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column('bigint', { transformer: new ColumnNumericTransformer(), default: 0 })
  timestamp!: number;
  @Column('text')
  text!: string;
  @ManyToOne(() => RaffleParticipant, (r) => r.messages, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  participant!: RaffleParticipant;
}